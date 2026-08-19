import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { GitOperationState } from "../../../src/shared/git-contract";
import { isValidBranchName } from "../../../src/shared/git-security";
import {
  GitService,
  parsePorcelainStatus,
  toWorkspaceGitPath,
  type GitCommandResult,
} from "../../../src/main/git/git-service";

function ok(stdout = ""): GitCommandResult {
  return { stdout, stderr: "", code: 0 };
}

describe("parsePorcelainStatus", () => {
  it("maps porcelain=v1 codes to typed GitFileStatus", () => {
    const files = parsePorcelainStatus(
      [" M app.ts", "A  added.ts", "D  gone.ts", "?? new.txt", "R  old.ts -> new-name.ts", "UU conflict.ts"].join(
        "\n"
      )
    );
    expect(files).toEqual(
      expect.arrayContaining([
        { path: "app.ts", status: "modified", staged: false },
        { path: "added.ts", status: "added", staged: true },
        { path: "gone.ts", status: "deleted", staged: true },
        { path: "new.txt", status: "untracked", staged: false },
        { path: "new-name.ts", status: "renamed", staged: true, originalPath: "old.ts" },
        { path: "conflict.ts", status: "conflicted", staged: true },
        { path: "conflict.ts", status: "conflicted", staged: false },
      ])
    );
  });
});

describe("GitService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("status parses porcelain=v1 including modified, added, untracked, and conflicted", async () => {
    const runGit = vi.fn(async (args: string[]) => {
      if (args[0] === "branch") return ok("main\n");
      if (args[0] === "status") {
        return ok(
          [
            "## main...origin/main [ahead 1, behind 2]",
            " M app.ts",
            "A  added.ts",
            "?? new.txt",
            "UU conflict.ts",
          ].join("\n")
        );
      }
      return ok();
    });
    const service = new GitService({ runGit });
    const status = await service.status("/repo");
    expect(runGit).toHaveBeenCalledWith(["status", "--porcelain=v1", "--branch"], "/repo");
    expect(status.branch).toBe("main");
    expect(status.ahead).toBe(1);
    expect(status.behind).toBe(2);
    expect(status.hasConflicts).toBe(true);
    expect(status.isClean).toBe(false);
    expect(status.files.some((file) => file.path === "app.ts" && file.status === "modified")).toBe(true);
    expect(status.files.some((file) => file.path === "added.ts" && file.status === "added")).toBe(true);
    expect(status.files.some((file) => file.path === "new.txt" && file.status === "untracked")).toBe(true);
    expect(status.files.some((file) => file.path === "conflict.ts" && file.status === "conflicted")).toBe(
      true
    );
  });

  it("stage/unstage call git add / git restore --staged with a -- separator", async () => {
    const runGit = vi.fn(async () => ok());
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "caval-git-svc-"));
    try {
      fs.writeFileSync(path.join(cwd, "app.ts"), "export const v = 1;\n");
      const service = new GitService({ runGit });
      await service.stage(cwd, ["app.ts"]);
      await service.unstage(cwd, ["app.ts"]);
      expect(runGit).toHaveBeenCalledWith(["add", "--", "app.ts"], cwd);
      expect(runGit).toHaveBeenCalledWith(["restore", "--staged", "--", "app.ts"], cwd);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("commit without files does not git add; with files adds before commit", async () => {
    const runGit = vi.fn(async (args: string[]) => {
      if (args[0] === "rev-parse") return ok("abc123\n");
      return ok();
    });
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "caval-git-commit-"));
    try {
      fs.writeFileSync(path.join(cwd, "app.ts"), "export const v = 1;\n");
      const service = new GitService({ runGit });

      runGit.mockClear();
      const withoutFiles = await service.commit(cwd, { message: "chore: no add" });
      expect(withoutFiles).toEqual({ hash: "abc123", message: "chore: no add" });
      expect(runGit.mock.calls.some(([args]) => args[0] === "add")).toBe(false);
      expect(runGit).toHaveBeenCalledWith(["commit", "-m", "chore: no add"], cwd);
      expect(runGit.mock.calls.find(([args]) => args[0] === "commit")?.[0].join(" ")).not.toMatch(
        /--amend|--force|--no-verify/
      );

      runGit.mockClear();
      await service.commit(cwd, { message: "fix: staged", files: ["app.ts"] });
      const addIndex = runGit.mock.calls.findIndex(([args]) => args[0] === "add");
      const commitIndex = runGit.mock.calls.findIndex(([args]) => args[0] === "commit");
      expect(runGit).toHaveBeenCalledWith(["add", "--", "app.ts"], cwd);
      expect(runGit).toHaveBeenCalledWith(["commit", "-m", "fix: staged"], cwd);
      expect(addIndex).toBeGreaterThanOrEqual(0);
      expect(commitIndex).toBeGreaterThan(addIndex);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("checkout with a valid branch calls git checkout <branch> without --", async () => {
    const runGit = vi.fn(async () => ok());
    const service = new GitService({ runGit });
    await service.checkout("/repo", "feature/m3-git");
    expect(runGit).toHaveBeenCalledWith(["checkout", "feature/m3-git"], "/repo");
    expect(runGit).not.toHaveBeenCalledWith(["checkout", "--", "feature/m3-git"], "/repo");
  });

  it("createBranch with from calls git checkout -b <name> <from>", async () => {
    const runGit = vi.fn(async () => ok());
    const service = new GitService({ runGit });
    await service.createBranch("/repo", "feat/m3", "main");
    expect(runGit).toHaveBeenCalledWith(["checkout", "-b", "feat/m3", "main"], "/repo");
  });

  it("diff with staged: true adds --cached", async () => {
    const runGit = vi.fn(async () => ok("diff --git a/app.ts b/app.ts\n"));
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "caval-git-diff-"));
    try {
      fs.writeFileSync(path.join(cwd, "app.ts"), "export const v = 1;\n");
      const service = new GitService({ runGit });
      const result = await service.diff(cwd, "app.ts", true);
      expect(runGit).toHaveBeenCalledWith(["diff", "--cached", "--", "app.ts"], cwd);
      expect(result).toEqual({
        path: "app.ts",
        diff: "diff --git a/app.ts b/app.ts\n",
        binary: false,
      });
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("log parses %H%x00... format", async () => {
    const runGit = vi.fn(async () =>
      ok("aaa111\x00aaa\x00fix: bug\x00Ada\x00ada@caval.dev\x002026-08-19T10:00:00+03:00")
    );
    const service = new GitService({ runGit });
    const entries = await service.log("/repo", 10);
    expect(runGit).toHaveBeenCalledWith(
      ["log", "-10", "--pretty=format:%H%x00%h%x00%s%x00%an%x00%ae%x00%aI"],
      "/repo"
    );
    expect(entries).toEqual([
      {
        hash: "aaa111",
        shortHash: "aaa",
        message: "fix: bug",
        author: "Ada",
        email: "ada@caval.dev",
        date: "2026-08-19T10:00:00+03:00",
      },
    ]);
  });

  it("emitOperation emits running then success/failed with a timestamp", async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "caval-git-op-"));
    try {
      fs.writeFileSync(path.join(cwd, "app.ts"), "export const v = 1;\n");

      const okRun = vi.fn(async () => ok());
      const service = new GitService({ runGit: okRun });
      const ops: GitOperationState[] = [];
      service.on("operation-changed", (state: GitOperationState) => ops.push(state));

      await service.stage(cwd, ["app.ts"]);
      expect(ops.map((op) => op.status)).toEqual(["running", "success"]);
      expect(ops[0]?.operation).toBe("stage");
      expect(ops[0]?.timestamp).toEqual(expect.any(Number));
      expect(ops[1]?.timestamp).toEqual(expect.any(Number));
      expect((ops[1]?.timestamp ?? 0) >= (ops[0]?.timestamp ?? 1)).toBe(true);

      const failing = new GitService({
        runGit: async (args) => {
          if (args[0] === "add") return { stdout: "", stderr: "denied", code: 1 };
          return ok();
        },
      });
      const failed: GitOperationState[] = [];
      failing.on("operation-changed", (state: GitOperationState) => failed.push(state));
      await expect(failing.stage(cwd, ["app.ts"])).rejects.toThrow(/denied/i);
      expect(failed.map((op) => op.status)).toEqual(["running", "failed"]);
      expect(failed[1]?.error).toMatch(/denied/i);
      expect(failed[1]?.timestamp).toEqual(expect.any(Number));
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("rejects flag-like and escaping paths", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "caval-git-path-"));
    try {
      expect(() => toWorkspaceGitPath(cwd, "--all")).toThrow(/invalid/i);
      expect(() => toWorkspaceGitPath(cwd, "../outside.ts")).toThrow(/outside|invalid/i);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe("isValidBranchName CLI injection", () => {
  it("rejects leading dash names such as -x", () => {
    expect(isValidBranchName("-x")).toBe(false);
    expect(isValidBranchName("--upload-pack=evil")).toBe(false);
  });
});
