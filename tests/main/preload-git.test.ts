import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock("electron", () => ({
  ipcRenderer: {
    invoke,
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}));

import { assertGitBranchName, assertGitRelPath, gitApi, cavalGitPreload } from "../../src/main/preload-git";
import { GIT_CHANNELS } from "../../src/shared/git-ipc-channels";
import type { GitBranch, GitStatus } from "../../src/shared/git-contract";

const sampleStatus: GitStatus & { isRepo: boolean; upstream: string | null } = {
  branch: "main",
  ahead: 0,
  behind: 1,
  isRepo: true,
  upstream: "origin/main",
  files: [{ path: "app.ts", status: "modified", staged: false }],
};

describe("preload-git", () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue(sampleStatus);
  });

  it("gitApi.status invokes git:status without a renderer cwd", async () => {
    await gitApi.status();
    expect(invoke).toHaveBeenCalledWith(GIT_CHANNELS.status);
  });

  it("gitApi.stage sends a files array", async () => {
    invoke.mockResolvedValue({ ok: true });
    await gitApi.stage(["app.ts"]);
    expect(invoke).toHaveBeenCalledWith(GIT_CHANNELS.stage, ["app.ts"]);
  });

  it("compat status(projectPath) maps named statuses back to porcelain for GitPanel", async () => {
    const compat = await cavalGitPreload.status("C:\\proj");
    expect(compat.isRepo).toBe(true);
    expect(compat.files[0]?.status).toBe("M");
  });

  it("compat branches(projectPath) returns branch name strings", async () => {
    invoke.mockResolvedValue([
      { name: "main", current: true, remote: "origin/main" },
    ] satisfies GitBranch[]);
    const names = await cavalGitPreload.branches("C:\\proj");
    expect(names).toEqual(["main"]);
  });

  it("rejects flag-like paths and branch names before IPC", () => {
    expect(() => assertGitRelPath("--all")).toThrow(TypeError);
    expect(() => assertGitBranchName("-evil")).toThrow(TypeError);
    expect(() => assertGitBranchName("feat/ok")).not.toThrow();
  });
});
