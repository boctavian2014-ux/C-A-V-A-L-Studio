import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { assertPathInWorkspace, normalizeWorkspaceRoot } from "../../src/main/path-security";
import { parseProjectHealthAction } from "../../src/shared/project-health-check";

const { harness, healthRunnerMock } = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const mainFrame = { parent: null as null, url: "file:///caval-renderer/index.html" };
  const sender = {
    id: 42,
    send: vi.fn(),
    isDestroyed: () => false,
    getURL: () => "file:///caval-renderer/index.html",
    mainFrame,
  };
  const ipcMain = {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    },
    on: () => undefined,
  };
  return {
    healthRunnerMock: {
      runProjectHealthSnapshot: vi.fn(
        async (_workspaceRoot: string, _options?: { execute?: boolean }) => ({
          packageFound: true,
          packageName: "test-pkg",
          checks: [],
        })
      ),
    },
    harness: {
      ipcMain,
      sender,
      async invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
        const handler = handlers.get(channel);
        if (!handler) throw new Error(`No IPC handler registered for ${channel}`);
        return (await handler({ sender, senderFrame: sender.mainFrame }, ...args)) as T;
      },
      reset() {
        handlers.clear();
        sender.send.mockClear();
        sender.getURL = () => "file:///caval-renderer/index.html";
        sender.mainFrame.url = "file:///caval-renderer/index.html";
      },
    },
  };
});

vi.mock("electron", () => ({
  ipcMain: harness.ipcMain,
}));

vi.mock("../../ai/tools/project-health-runner", () => ({
  runProjectHealthSnapshot: healthRunnerMock.runProjectHealthSnapshot,
}));

describe("project-health IPC security", () => {
  const boundRoots = new Map<number, string>();

  beforeEach(async () => {
    harness.reset();
    boundRoots.clear();
    healthRunnerMock.runProjectHealthSnapshot.mockClear();

    vi.resetModules();
    const { registerModelHandlers } = await import("../../src/main/model-handlers.js");
    registerModelHandlers((senderId) => boundRoots.get(senderId));
  });

  afterEach(() => {
    boundRoots.clear();
  });

  it("assertTrustedSender throws for https (untrusted) sender", async () => {
    const { assertTrustedSender } = await import("../../src/main/ipc-trust.js");
    const untrusted = {
      sender: {
        ...harness.sender,
        getURL: () => "https://evil.example/attack",
        mainFrame: { parent: null, url: "https://evil.example/attack" },
      },
      senderFrame: { parent: null, url: "https://evil.example/attack" },
    };
    expect(() => assertTrustedSender(untrusted as never)).toThrow(/Untrusted IPC sender/i);
  });

  it("IPC rejects untrusted sender without crashing", async () => {
    harness.sender.getURL = () => "https://evil.example/";
    harness.sender.mainFrame.url = "https://evil.example/";
    const result = await harness.invoke<{ ok: boolean; error?: string }>(
      "caval:project-health-check",
      "scan"
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Untrusted IPC sender/i);
    expect(healthRunnerMock.runProjectHealthSnapshot).not.toHaveBeenCalled();
  });

  it("IPC rejects unbound workspace with clear error (no crash)", async () => {
    expect(boundRoots.has(harness.sender.id)).toBe(false);
    const result = await harness.invoke<{ ok: boolean; error?: string }>(
      "caval:project-health-check",
      "scan"
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Deschide un folder/i);
    expect(healthRunnerMock.runProjectHealthSnapshot).not.toHaveBeenCalled();
  });

  it("parseProjectHealthAction rejects invalid actions including delete/shell", () => {
    expect(parseProjectHealthAction("delete")).toBeNull();
    expect(parseProjectHealthAction("shell")).toBeNull();
    expect(parseProjectHealthAction("npm run build")).toBeNull();
    expect(parseProjectHealthAction({ execute: true })).toBeNull();
    expect(parseProjectHealthAction(["scan"])).toBeNull();
    expect(parseProjectHealthAction("scan")).toBe("scan");
    expect(parseProjectHealthAction("execute")).toBe("execute");
  });

  it("IPC rejects invalid action strings", async () => {
    boundRoots.set(harness.sender.id, process.cwd());
    for (const bad of ["delete", "shell", "build", "../../../etc"]) {
      const result = await harness.invoke<{ ok: boolean; error?: string }>(
        "caval:project-health-check",
        bad
      );
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/Invalid project health action/i);
    }
    expect(healthRunnerMock.runProjectHealthSnapshot).not.toHaveBeenCalled();
  });

  it("blocks path traversal outside workspace via assertPathInWorkspace", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "caval-health-"));
    try {
      const root = normalizeWorkspaceRoot(tmp);
      expect(() => assertPathInWorkspace(root, path.join(root, "..", "outside.txt"))).toThrow(
        /Path outside workspace/i
      );
      expect(() => assertPathInWorkspace(root, path.join(root, "pkg", "..", "..", "escape"))).toThrow(
        /Path outside workspace/i
      );
      const inside = assertPathInWorkspace(root, path.join(root, "package.json"));
      expect(path.resolve(inside)).toBe(path.resolve(root, "package.json"));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("IPC ignores renderer-supplied workspaceRoot and uses bound root only", async () => {
    const bound = normalizeWorkspaceRoot(process.cwd());
    boundRoots.set(harness.sender.id, bound);

    await harness.invoke("caval:project-health-check", "scan", "C:\\Windows\\System32", {
      cwd: "C:\\evil",
      command: "calc.exe",
    });

    expect(healthRunnerMock.runProjectHealthSnapshot).toHaveBeenCalledTimes(1);
    expect(healthRunnerMock.runProjectHealthSnapshot.mock.calls[0]?.[0]).toBe(bound);
    expect(healthRunnerMock.runProjectHealthSnapshot.mock.calls[0]?.[1]).toEqual({ execute: false });
  });
});
