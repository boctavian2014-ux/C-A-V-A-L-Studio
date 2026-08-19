import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockInvoke, mockOn, mockRemoveListener } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockOn: vi.fn(),
  mockRemoveListener: vi.fn(),
}));

vi.mock("electron", () => ({
  ipcRenderer: {
    invoke: mockInvoke,
    on: mockOn,
    removeListener: mockRemoveListener,
  },
}));

import { gitApi } from "../../src/main/preload-git";
import { GIT_CHANNELS } from "../../src/shared/git-ipc-channels";

describe("preload-git", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("status", () => {
    it("invokes git:status", async () => {
      mockInvoke.mockResolvedValue({ branch: "main", files: [] });
      await gitApi.status();
      expect(mockInvoke).toHaveBeenCalledWith(GIT_CHANNELS.status);
    });
  });

  describe("stage", () => {
    it("invokes git:stage with valid files", async () => {
      mockInvoke.mockResolvedValue(undefined);
      await gitApi.stage(["src/index.ts"]);
      expect(mockInvoke).toHaveBeenCalledWith(GIT_CHANNELS.stage, ["src/index.ts"]);
    });

    it("rejects path traversal", async () => {
      await expect(gitApi.stage(["../evil.ts"])).rejects.toThrow(TypeError);
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it("rejects absolute paths", async () => {
      await expect(gitApi.stage(["/etc/passwd"])).rejects.toThrow(TypeError);
      expect(mockInvoke).not.toHaveBeenCalled();
    });
  });

  describe("commit", () => {
    it("invokes git:commit with valid input", async () => {
      mockInvoke.mockResolvedValue({ hash: "abc123", message: "fix" });
      await gitApi.commit({ message: "fix: bug" });
      expect(mockInvoke).toHaveBeenCalledWith(GIT_CHANNELS.commit, { message: "fix: bug" });
    });

    it("rejects empty message", async () => {
      await expect(gitApi.commit({ message: "" })).rejects.toThrow(TypeError);
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it("rejects invalid files in commit", async () => {
      await expect(gitApi.commit({ message: "fix", files: ["../evil.ts"] })).rejects.toThrow(TypeError);
      expect(mockInvoke).not.toHaveBeenCalled();
    });
  });

  describe("checkout", () => {
    it("invokes git:checkout with valid branch", async () => {
      mockInvoke.mockResolvedValue(undefined);
      await gitApi.checkout("feature/m3-git");
      expect(mockInvoke).toHaveBeenCalledWith(GIT_CHANNELS.checkout, "feature/m3-git");
    });

    it("rejects invalid branch name", async () => {
      await expect(gitApi.checkout("branch with spaces")).rejects.toThrow(TypeError);
      expect(mockInvoke).not.toHaveBeenCalled();
    });
  });

  describe("log", () => {
    it("invokes git:log with valid limit", async () => {
      mockInvoke.mockResolvedValue([]);
      await gitApi.log(10);
      expect(mockInvoke).toHaveBeenCalledWith(GIT_CHANNELS.log, 10);
    });

    it("rejects invalid limit", async () => {
      await expect(gitApi.log(0)).rejects.toThrow(TypeError);
      await expect(gitApi.log(1001)).rejects.toThrow(TypeError);
      await expect(gitApi.log(1.5)).rejects.toThrow(TypeError);
    });
  });

  describe("onStatusChange", () => {
    it("registers listener and returns cleanup", () => {
      const cb = vi.fn();
      const cleanup = gitApi.onStatusChange(cb);
      expect(mockOn).toHaveBeenCalledWith(GIT_CHANNELS.statusChanged, expect.any(Function));
      cleanup();
      expect(mockRemoveListener).toHaveBeenCalledWith(GIT_CHANNELS.statusChanged, expect.any(Function));
    });

    it("callback receives only payload, not event", () => {
      const cb = vi.fn();
      gitApi.onStatusChange(cb);
      const listener = mockOn.mock.calls[0][1];
      listener({ sender: {} }, { branch: "main", files: [] });
      expect(cb).toHaveBeenCalledWith({ branch: "main", files: [] });
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb.mock.calls[0].length).toBe(1);
    });
  });

  describe("onOperationChange", () => {
    it("registers listener and returns cleanup", () => {
      const cb = vi.fn();
      const cleanup = gitApi.onOperationChange(cb);
      expect(mockOn).toHaveBeenCalledWith(GIT_CHANNELS.operationChanged, expect.any(Function));
      cleanup();
      expect(mockRemoveListener).toHaveBeenCalledWith(GIT_CHANNELS.operationChanged, expect.any(Function));
    });
  });
});
