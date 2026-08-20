import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createIpcHarness } from "../ipc-harness";
import { GIT_CHANNELS } from "../../../src/shared/git-ipc-channels";
import type { GitOperationState, GitStatus } from "../../../src/shared/git-contract";
import { gitService } from "../../../src/main/git/git-service";

const harness = createIpcHarness();
const boundRoots = new Map<number, string>();
const showMessageBox = vi.fn().mockResolvedValue({ response: 0 });
const showOpenDialog = vi.fn().mockResolvedValue({ canceled: true, filePaths: [] });
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
  dialog: {
    showMessageBox,
    showOpenDialog,
  },
}));

vi.mock("../../../src/main/ipc-trust", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/main/ipc-trust")>();
  return {
    ...actual,
    assertTrustedSender: (...args: unknown[]) => mockAssertTrustedSender(...args),
  };
});

const sampleStatus: GitStatus = {
  branch: "main",
  ahead: 0,
  behind: 0,
  files: [],
  hasConflicts: false,
  isClean: true,
};

describe("git handlers — typed contract", () => {
  const boundRoot = path.resolve(os.tmpdir(), "caval-git-bound-root");

  beforeEach(async () => {
    harness.reset();
    boundRoots.clear();
    boundRoots.set(harness.sender.id, boundRoot);
    sendA.mockClear();
    sendB.mockClear();
    sendDestroyed.mockClear();
    mockAssertTrustedSender.mockReset();
    mockAssertTrustedSender.mockImplementation(() => undefined);
    showMessageBox.mockClear();
    showMessageBox.mockResolvedValue({ response: 0 });
    showOpenDialog.mockClear();
    showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
    const { registerGitHandlers } = await import("../../../src/main/git-handlers.js");
    registerGitHandlers((id: number) => boundRoots.get(id));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls assertTrustedSender before gitService for each typed handler", async () => {
    const order: string[] = [];
    mockAssertTrustedSender.mockImplementation(() => {
      order.push("assert");
    });
    vi.spyOn(gitService, "status").mockImplementation(async () => {
      order.push("service");
      return { ...sampleStatus, isRepo: true, upstream: null };
    });

    await harness.invoke(GIT_CHANNELS.status);
    expect(order).toEqual(["assert", "service"]);
    expect(mockAssertTrustedSender).toHaveBeenCalled();
  });

  it("does not call gitService when assertTrustedSender throws", async () => {
    mockAssertTrustedSender.mockImplementation(() => {
      throw new Error("Untrusted IPC sender");
    });
    const status = vi.spyOn(gitService, "status");
    await expect(harness.invoke(GIT_CHANNELS.status)).rejects.toThrow(/Untrusted IPC sender/i);
    expect(status).not.toHaveBeenCalled();
  });

  it("uses the bound workspace root, not a cwd from the payload", async () => {
    const status = vi.spyOn(gitService, "status").mockResolvedValue({
      ...sampleStatus,
      isRepo: true,
      upstream: null,
    });
    await harness.invoke(GIT_CHANNELS.status, "C:\\Windows\\System32");
    expect(status).toHaveBeenCalledTimes(1);
    expect(status).toHaveBeenCalledWith(boundRoot);
    expect(status.mock.calls[0]?.[0]).not.toMatch(/Windows\\System32/i);
  });

  it("rejects invalid files, branch, and message with TypeError before gitService", async () => {
    const stage = vi.spyOn(gitService, "stage");
    const checkout = vi.spyOn(gitService, "checkout");
    const commit = vi.spyOn(gitService, "commit");
    const discard = vi.spyOn(gitService, "discardChanges");

    await expect(harness.invoke(GIT_CHANNELS.stage, ["../evil.ts"])).rejects.toThrow(TypeError);
    await expect(harness.invoke(GIT_CHANNELS.checkout, "-x")).rejects.toThrow(TypeError);
    await expect(harness.invoke(GIT_CHANNELS.commit, { message: "" })).rejects.toThrow(TypeError);
    await expect(harness.invoke(GIT_CHANNELS.discardChanges, ["/etc/passwd"])).rejects.toThrow(
      TypeError
    );

    expect(stage).not.toHaveBeenCalled();
    expect(checkout).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
    expect(discard).not.toHaveBeenCalled();
  });

  it("broadcasts status-changed and operation-changed to all live windows, not just the sender", () => {
    const statusPayload = { ...sampleStatus };
    const operationPayload: GitOperationState = {
      operation: "stage",
      status: "running",
      error: null,
      timestamp: Date.now(),
    };

    gitService.emit("status-changed", statusPayload);
    gitService.emit("operation-changed", operationPayload);

    expect(sendA).toHaveBeenCalledWith(GIT_CHANNELS.statusChanged, statusPayload);
    expect(sendB).toHaveBeenCalledWith(GIT_CHANNELS.statusChanged, statusPayload);
    expect(sendA).toHaveBeenCalledWith(GIT_CHANNELS.operationChanged, operationPayload);
    expect(sendB).toHaveBeenCalledWith(GIT_CHANNELS.operationChanged, operationPayload);
    expect(sendDestroyed).not.toHaveBeenCalled();
    expect(harness.sender.send).not.toHaveBeenCalled();
  });

  it("typed push/pull ignore renderer projectPath and pass only boolean flags", async () => {
    const push = vi.spyOn(gitService, "push").mockResolvedValue(undefined);
    const pull = vi.spyOn(gitService, "pull").mockResolvedValue(undefined);

    await harness.invoke(GIT_CHANNELS.push, { setUpstream: true });
    expect(push).toHaveBeenCalledWith(boundRoot, true);

    await harness.invoke(GIT_CHANNELS.pull, { rebase: true });
    expect(pull).toHaveBeenCalledWith(boundRoot, true);
  });

  it("typed push throws when the user cancels confirmation", async () => {
    const push = vi.spyOn(gitService, "push").mockResolvedValue(undefined);
    showMessageBox.mockResolvedValueOnce({ response: 1 });
    await expect(harness.invoke(GIT_CHANNELS.push, {})).rejects.toThrow(/anulat/i);
    expect(push).not.toHaveBeenCalled();
  });

  it("clone rejects blocked URLs and non-GitHub hosts before spawn", async () => {
    const clone = vi.spyOn(gitService, "clone").mockResolvedValue(undefined);

    await expect(harness.invoke(GIT_CHANNELS.clone, "file:///tmp/evil")).rejects.toThrow(TypeError);
    await expect(harness.invoke(GIT_CHANNELS.clone, "https://localhost/repo.git")).rejects.toThrow(
      TypeError
    );
    await expect(harness.invoke(GIT_CHANNELS.clone, "https://gitlab.com/a/b.git")).rejects.toThrow(
      /GitHub invalid/i
    );
    expect(clone).not.toHaveBeenCalled();
    expect(showMessageBox).not.toHaveBeenCalled();
  });

  it("clone destination comes from the dialog, not from renderer parentDir", async () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "caval-clone-parent-"));
    try {
      const clone = vi.spyOn(gitService, "clone").mockResolvedValue(undefined);
      showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: [parent],
      });

      const result = await harness.invoke<{ path: string }>(
        GIT_CHANNELS.clone,
        "https://github.com/octocat/Hello-World.git"
      );

      expect(showMessageBox).toHaveBeenCalled();
      expect(showOpenDialog).toHaveBeenCalled();
      expect(clone).toHaveBeenCalledTimes(1);
      expect(clone.mock.calls[0]?.[0]).toBe(path.resolve(parent));
      expect(clone.mock.calls[0]?.[1]).toBe("https://github.com/octocat/Hello-World.git");
      expect(clone.mock.calls[0]?.[2]).toBe(path.resolve(parent, "Hello-World"));
      expect(result.path).toBe(path.resolve(parent, "Hello-World"));

      await harness.invoke(GIT_CHANNELS.clone, {
        url: "https://github.com/octocat/Hello-World.git",
        parentDir: "C:\\Windows\\System32",
      });
      expect(clone.mock.calls[1]?.[0]).toBe(path.resolve(parent));
      expect(clone.mock.calls[1]?.[0]).not.toMatch(/Windows\\System32/i);
    } finally {
      fs.rmSync(parent, { recursive: true, force: true });
    }
  });
});
