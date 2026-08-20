import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createIpcHarness } from "../ipc-harness";
import { PROBLEMS_CHANNELS } from "../../../src/shared/problems-ipc-channels";
import { problemsService } from "../../../src/main/problems/problems-service";
import type { Problem, ProblemsSummary } from "../../../src/shared/problems-contract";

const harness = createIpcHarness();
const boundRoots = new Map<number, string>();
const sendA = vi.fn();
const sendB = vi.fn();
const sendDestroyed = vi.fn();

const { mockAssertTrustedSender } = vi.hoisted(() => ({
  mockAssertTrustedSender: vi.fn(),
}));

vi.mock("electron", () => ({
  ipcMain: harness.ipcMain,
  BrowserWindow: {
    fromWebContents: vi.fn(() => null),
    getAllWindows: vi.fn(() => [
      { isDestroyed: () => false, webContents: { send: sendA } },
      { isDestroyed: () => false, webContents: { send: sendB } },
      { isDestroyed: () => true, webContents: { send: sendDestroyed } },
    ]),
  },
}));

vi.mock("../../../src/main/ipc-trust", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/main/ipc-trust")>();
  return {
    ...actual,
    assertTrustedSender: (...args: unknown[]) => mockAssertTrustedSender(...args),
  };
});

const sampleProblem: Problem = {
  id: "ts-src/app.ts-1-1-TS2322",
  file: "src/app.ts",
  line: 1,
  column: 1,
  severity: "error",
  source: "typescript",
  message: "Type mismatch",
  code: "TS2322",
};

describe("problems handlers — typed contract", () => {
  const boundRoot = path.resolve(os.tmpdir(), "caval-problems-bound-root");

  beforeEach(async () => {
    harness.reset();
    boundRoots.clear();
    boundRoots.set(harness.sender.id, boundRoot);
    sendA.mockClear();
    sendB.mockClear();
    sendDestroyed.mockClear();
    mockAssertTrustedSender.mockReset();
    mockAssertTrustedSender.mockImplementation(() => undefined);
    const { registerProblemsHandlers } = await import("../../../src/main/problems-handlers");
    registerProblemsHandlers((id) => boundRoots.get(id));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls assertTrustedSender before the service", async () => {
    const order: string[] = [];
    mockAssertTrustedSender.mockImplementation(() => {
      order.push("assert");
    });
    vi.spyOn(problemsService, "getSummary").mockImplementation(() => {
      order.push("service");
      return { total: 0, errors: 0, warnings: 0, infos: 0, hints: 0 };
    });

    await harness.invoke(PROBLEMS_CHANNELS.getSummary);
    expect(order).toEqual(["assert", "service"]);
  });

  it("does not call the service when assertTrustedSender throws", async () => {
    mockAssertTrustedSender.mockImplementation(() => {
      throw new Error("Untrusted IPC sender");
    });
    const collect = vi.spyOn(problemsService, "collect");
    await expect(harness.invoke(PROBLEMS_CHANNELS.refresh)).rejects.toThrow(/Untrusted IPC sender/i);
    expect(collect).not.toHaveBeenCalled();
  });

  it("refresh uses the bound workspace root, not a cwd from the payload", async () => {
    const collect = vi.spyOn(problemsService, "collect").mockResolvedValue(undefined);
    await harness.invoke(PROBLEMS_CHANNELS.refresh, "C:\\Windows\\System32");
    expect(collect).toHaveBeenCalledTimes(1);
    expect(collect).toHaveBeenCalledWith(boundRoot);
    expect(collect.mock.calls[0]?.[0]).not.toMatch(/Windows\\System32/i);
  });

  it("rejects invalid file filters with TypeError before the service", async () => {
    const getProblems = vi.spyOn(problemsService, "getProblems");
    await expect(harness.invoke(PROBLEMS_CHANNELS.getProblems, "../evil.ts")).rejects.toThrow(TypeError);
    await expect(harness.invoke(PROBLEMS_CHANNELS.getProblems, "/etc/passwd")).rejects.toThrow(TypeError);
    expect(getProblems).not.toHaveBeenCalled();
  });

  it("broadcasts problems-changed and summary-changed to all live windows", () => {
    const summary: ProblemsSummary = { total: 1, errors: 1, warnings: 0, infos: 0, hints: 0 };
    problemsService.emit("problems-changed", [sampleProblem]);
    problemsService.emit("summary-changed", summary);

    expect(sendA).toHaveBeenCalledWith(PROBLEMS_CHANNELS.problemsChanged, [sampleProblem]);
    expect(sendB).toHaveBeenCalledWith(PROBLEMS_CHANNELS.problemsChanged, [sampleProblem]);
    expect(sendA).toHaveBeenCalledWith(PROBLEMS_CHANNELS.summaryChanged, summary);
    expect(sendDestroyed).not.toHaveBeenCalled();
    expect(harness.sender.send).not.toHaveBeenCalled();
  });
});
