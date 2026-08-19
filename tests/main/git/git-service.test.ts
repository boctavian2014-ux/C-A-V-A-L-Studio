import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  GitService,
  parseBranchList,
  parsePorcelainStatus,
  toWorkspaceGitPath,
} from "../../../src/main/git/git-service";

describe("parsePorcelainStatus", () => {
  it("maps porcelain codes to typed GitFileStatus", () => {
    const files = parsePorcelainStatus(
      [" M app.ts", "A  added.ts", "D  gone.ts", "?? new.txt", "R  old.ts -> new-name.ts"].join("\n")
    );
    expect(files).toEqual(
      expect.arrayContaining([
        { path: "app.ts", status: "modified", staged: false },
        { path: "added.ts", status: "added", staged: true },
        { path: "gone.ts", status: "deleted", staged: true },
        { path: "new.txt", status: "untracked", staged: false },
        { path: "new-name.ts", status: "renamed", staged: true },
      ])
    );
  });
});

describe("parseBranchList", () => {
  it("reads HEAD marker, name, and upstream from tab-separated for-each-ref", () => {
    const branches = parseBranchList("*\tmain\torigin/main\n \tfeat\t\n");
    expect(branches).toEqual([
      { name: "main", current: true, remote: "origin/main" },
      { name: "feat", current: false, remote: null },
    ]);
  });
});

describe("GitService", () => {
  it("stages with git add -- and never interpolates a shell string", async () => {
    const exec = vi.fn(async () => ({ stdout: "", stderr: "", timedOut: false }));
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "caval-git-svc-"));
    try {
      fs.writeFileSync(path.join(cwd, "app.ts"), "export const v = 1;\n");
      const service = new GitService({
        exec,
        isRepo: async () => true,
      });
      await service.stage(cwd, ["app.ts"]);
      expect(exec).toHaveBeenCalledWith(cwd, ["add", "--", "app.ts"]);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("commits with -m only (no --amend / --no-verify / --force)", async () => {
    const exec = vi.fn(async (_cwd: string, args: string[]) => {
      if (args[0] === "commit") {
        return { stdout: "[main abcdef0] msg", stderr: "", timedOut: false };
      }
      return { stdout: "", stderr: "", timedOut: false };
    });
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "caval-git-commit-"));
    try {
      fs.writeFileSync(path.join(cwd, "app.ts"), "export const v = 1;\n");
      const service = new GitService({ exec, isRepo: async () => true });
      const hash = await service.commit(cwd, { message: "Bump", files: ["app.ts"] });
      expect(hash).toBe("abcdef0");
      const commitCall = exec.mock.calls.find((call) => call[1][0] === "commit");
      expect(commitCall?.[1]).toEqual(["commit", "-m", "Bump"]);
      expect(commitCall?.[1].join(" ")).not.toMatch(/--amend|--force|--no-verify/);
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
