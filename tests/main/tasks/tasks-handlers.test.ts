import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createIpcHarness } from "../ipc-harness";
import { TASKS_CHANNELS } from "../../../src/shared/tasks-ipc-channels";
import { tasksService } from "../../../src/main/tasks/tasks-service";
import type { Task, TaskOutputChunk, TaskRun } from "../../../src/shared/tasks-contract";

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

const sampleRun: TaskRun = {
  id: "run-1",
  taskName: "test",
  status: "running",
  startedAt: 1,
  finishedAt: null,
  exitCode: null,
  terminalId: "task:run-1",
};

describe("tasks handlers — typed contract", () => {
  const boundRoot = path.resolve(os.tmpdir(), "caval-tasks-bound-root");

  beforeEach(async () => {
    harness.reset();
    boundRoots.clear();
    boundRoots.set(harness.sender.id, boundRoot);
    sendA.mockClear();
    sendB.mockClear();
    sendDestroyed.mockClear();
    mockAssertTrustedSender.mockReset();
    mockAssertTrustedSender.mockImplementation(() => undefined);
    const { registerTasksHandlers } = await import("../../../src/main/tasks-handlers.js");
    registerTasksHandlers((id: number) => boundRoots.get(id));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls assertTrustedSender before the service", async () => {
    const order: string[] = [];
    mockAssertTrustedSender.mockImplementation(() => {
      order.push("assert");
    });
    vi.spyOn(tasksService, "list").mockImplementation(() => {
      order.push("service");
      return [];
    });

    await harness.invoke(TASKS_CHANNELS.list);
    expect(order).toEqual(["assert", "service"]);
  });

  it("does not call the service when assertTrustedSender throws", async () => {
    mockAssertTrustedSender.mockImplementation(() => {
      throw new Error("Untrusted IPC sender");
    });
    const run = vi.spyOn(tasksService, "run");
    await expect(harness.invoke(TASKS_CHANNELS.run, "test")).rejects.toThrow(/Untrusted IPC sender/i);
    expect(run).not.toHaveBeenCalled();
  });

  it("list/run use the bound workspace root, not a cwd from the payload", async () => {
    const list = vi.spyOn(tasksService, "list").mockReturnValue([]);
    await harness.invoke(TASKS_CHANNELS.list, "C:\\Windows\\System32");
    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith(boundRoot);
    expect(list.mock.calls[0]?.[0]).not.toMatch(/Windows\\System32/i);

    const run = vi.spyOn(tasksService, "run").mockResolvedValue(sampleRun);
    await harness.invoke(TASKS_CHANNELS.run, "test", "C:\\Windows\\System32");
    expect(run).toHaveBeenCalledWith(boundRoot, "test");
  });

  it("rejects invalid task names with TypeError before the service", async () => {
    const run = vi.spyOn(tasksService, "run");
    await expect(harness.invoke(TASKS_CHANNELS.run, "../evil")).rejects.toThrow(TypeError);
    await expect(harness.invoke(TASKS_CHANNELS.run, "")).rejects.toThrow(TypeError);
    await expect(harness.invoke(TASKS_CHANNELS.run, "-rf")).rejects.toThrow(TypeError);
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects invalid run ids with TypeError before the service", async () => {
    const stop = vi.spyOn(tasksService, "stop");
    await expect(harness.invoke(TASKS_CHANNELS.stop, "../x")).rejects.toThrow(TypeError);
    await expect(harness.invoke(TASKS_CHANNELS.getRun, "a/b")).rejects.toThrow(TypeError);
    expect(stop).not.toHaveBeenCalled();
  });

  it("broadcasts run-changed and output to all live windows", () => {
    const chunk: TaskOutputChunk = { runId: "run-1", taskName: "test", data: "ok\n" };
    tasksService.emit("run-changed", sampleRun);
    tasksService.emit("output", chunk);

    expect(sendA).toHaveBeenCalledWith(TASKS_CHANNELS.runChanged, sampleRun);
    expect(sendB).toHaveBeenCalledWith(TASKS_CHANNELS.runChanged, sampleRun);
    expect(sendA).toHaveBeenCalledWith(TASKS_CHANNELS.output, chunk);
    expect(sendDestroyed).not.toHaveBeenCalled();
    expect(harness.sender.send).not.toHaveBeenCalled();
  });

  it("returns listed tasks from the service", async () => {
    const tasks: Task[] = [{ name: "test", command: "vitest run", source: "package.json" }];
    vi.spyOn(tasksService, "list").mockReturnValue(tasks);
    await expect(harness.invoke(TASKS_CHANNELS.list)).resolves.toEqual(tasks);
  });
});
