import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createIpcHarness } from "./ipc-harness";

const harness = createIpcHarness();

vi.mock("electron", () => ({
  ipcMain: harness.ipcMain,
  BrowserWindow: { fromWebContents: vi.fn() },
}));

const hasGit = (() => {
  try {
    execSync("git --version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
})();

function initGitRepo(dir: string) {
  execSync("git init", { cwd: dir, stdio: "pipe" });
  execSync('git config user.email "test@caval.dev"', { cwd: dir, stdio: "pipe" });
  execSync('git config user.name "Caval Test"', { cwd: dir, stdio: "pipe" });
}

describe.skipIf(!hasGit)("Git IPC integration", () => {
  let repoPath: string;

  beforeEach(async () => {
    harness.reset();
    vi.resetModules();

    repoPath = await fs.mkdtemp(path.join(os.tmpdir(), "caval-git-ipc-"));
    initGitRepo(repoPath);
    await fs.writeFile(path.join(repoPath, "app.ts"), "export const v = 1;\n", "utf8");
    execSync("git add app.ts", { cwd: repoPath, stdio: "pipe" });
    execSync('git commit -m "initial"', { cwd: repoPath, stdio: "pipe" });

    const { registerGitHandlers } = await import("../../src/main/git-handlers");
    registerGitHandlers();
  });

  afterEach(async () => {
    await fs.rm(repoPath, { recursive: true, force: true });
  });

  it("git:status reports branch and tracked files", async () => {
    await fs.writeFile(path.join(repoPath, "app.ts"), "export const v = 2;\n", "utf8");
    await fs.writeFile(path.join(repoPath, "new.txt"), "hello\n", "utf8");

    const status = await harness.invoke<{
      isRepo: boolean;
      branch: string;
      files: Array<{ path: string; staged: boolean }>;
    }>("git:status", repoPath);

    expect(status.isRepo).toBe(true);
    expect(status.branch).toBeTruthy();
    expect(status.files.some((f) => f.path === "app.ts" && !f.staged)).toBe(true);
    expect(status.files.some((f) => f.path === "new.txt" && f.status === "?")).toBe(true);
  });

  it("git:status returns isRepo false outside a repository", async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "caval-not-git-"));
    try {
      const status = await harness.invoke<{ isRepo: boolean; files: unknown[] }>("git:status", outside);
      expect(status.isRepo).toBe(false);
      expect(status.files).toEqual([]);
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  });

  it("git:stage and git:diff reflect staged changes", async () => {
    await fs.writeFile(path.join(repoPath, "app.ts"), "export const v = 3;\n", "utf8");

    const staged = await harness.invoke<{ ok: boolean }>("git:stage", repoPath, "app.ts");
    expect(staged.ok).toBe(true);

    const diff = await harness.invoke<string>("git:diff", repoPath, "app.ts", true);
    expect(diff).toMatch(/v = 3/);

    const pair = await harness.invoke<{ original: string; modified: string; language: string }>(
      "git:filePair",
      repoPath,
      "app.ts",
      false
    );
    expect(pair.language).toBe("typescript");
    expect(pair.modified).toContain("v = 3");
  });

  it("git:commit rejects empty messages", async () => {
    const result = await harness.invoke<{ ok: boolean; error?: string }>("git:commit", repoPath, "   ");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/gol/i);
  });

  it("git:commit creates a commit when changes are staged", async () => {
    await fs.writeFile(path.join(repoPath, "app.ts"), "export const v = 99;\n", "utf8");
    await harness.invoke("git:stage", repoPath, "app.ts");

    const commit = await harness.invoke<{ ok: boolean; hash?: string }>(
      "git:commit",
      repoPath,
      "Bump version constant"
    );
    expect(commit.ok).toBe(true);
    expect(commit.hash).toMatch(/^[a-f0-9]+$/);

    const log = await harness.invoke<Array<{ subject: string }>>("git:log", repoPath, 5);
    expect(log[0]?.subject).toBe("Bump version constant");
  });

  it("git:revertHunk reverses a working-tree patch", async () => {
    const filePath = path.join(repoPath, "app.ts");
    const original = "line1\nline2\nline3\n";
    await fs.writeFile(filePath, original, "utf8");
    await fs.writeFile(filePath, "line1\nchanged\nline3\n", "utf8");

    const hunk = ["@@ -1,3 +1,3 @@", " line1", "-line2", "+changed", " line3"].join("\n");
    const reverted = await harness.invoke<{ ok: boolean }>("git:revertHunk", repoPath, "app.ts", hunk);

    expect(reverted.ok).toBe(true);
    expect(await fs.readFile(filePath, "utf8")).toBe(original);
  });

  it("git:branches lists local branches", async () => {
    const branches = await harness.invoke<string[]>("git:branches", repoPath);
    expect(branches.length).toBeGreaterThan(0);
  });
});
