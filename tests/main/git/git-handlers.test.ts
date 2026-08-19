import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createIpcHarness } from "../ipc-harness";
import { GIT_CHANNELS } from "../../../src/shared/git-ipc-channels";
import type { GitBranch, GitLogEntry, GitStatus } from "../../../src/shared/git-contract";

const harness = createIpcHarness();
const boundRoots = new Map<number, string>();
const showMessageBox = vi.fn().mockResolvedValue({ response: 0 });

vi.mock("electron", () => ({
  ipcMain: harness.ipcMain,
  BrowserWindow: { fromWebContents: vi.fn(() => null) },
  dialog: {
    showMessageBox,
    showOpenDialog: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] }),
  },
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

type StatusPayload = GitStatus & { isRepo: boolean };

describe.skipIf(!hasGit)("git handlers — typed contract", () => {
  let repoPath: string;

  beforeEach(async () => {
    harness.reset();
    vi.resetModules();
    showMessageBox.mockClear();
    showMessageBox.mockResolvedValue({ response: 0 });
    boundRoots.clear();

    repoPath = await fs.mkdtemp(path.join(os.tmpdir(), "caval-git-contract-"));
    initGitRepo(repoPath);
    await fs.writeFile(path.join(repoPath, "app.ts"), "export const v = 1;\n", "utf8");
    execSync("git add app.ts", { cwd: repoPath, stdio: "pipe" });
    execSync('git commit -m "initial"', { cwd: repoPath, stdio: "pipe" });
    boundRoots.set(harness.sender.id, repoPath);

    const { registerGitHandlers } = await import("../../../src/main/git-handlers");
    registerGitHandlers((id) => boundRoots.get(id));
  });

  afterEach(async () => {
    await fs.rm(repoPath, { recursive: true, force: true });
  });

  it("status() is bound to workspace and uses typed file statuses", async () => {
    await fs.writeFile(path.join(repoPath, "app.ts"), "export const v = 2;\n", "utf8");
    await fs.writeFile(path.join(repoPath, "new.txt"), "hello\n", "utf8");
    const status = await harness.invoke<StatusPayload>(GIT_CHANNELS.status, "C:\\Windows\\System32");
    expect(status.isRepo).toBe(true);
    expect(status.files.some((file) => file.path === "app.ts" && file.status === "modified")).toBe(
      true
    );
    expect(status.files.some((file) => file.path === "new.txt" && file.status === "untracked")).toBe(
      true
    );
  });

  it("stage(files[]) and commit({ message, files }) use the new payloads", async () => {
    await fs.writeFile(path.join(repoPath, "app.ts"), "export const v = 7;\n", "utf8");
    const staged = await harness.invoke<{ ok: boolean }>(GIT_CHANNELS.stage, ["app.ts"]);
    expect(staged.ok).toBe(true);

    const committed = await harness.invoke<{ ok: boolean; hash?: string }>(GIT_CHANNELS.commit, {
      message: "Typed commit",
      files: ["app.ts"],
    });
    expect(committed.ok).toBe(true);
    expect(committed.hash).toMatch(/^[a-f0-9]+$/);

    const log = await harness.invoke<GitLogEntry[]>(GIT_CHANNELS.log, 3);
    expect(log[0]?.message).toBe("Typed commit");
  });

  it("rejects relative paths that escape the workspace", async () => {
    const staged = await harness.invoke<{ ok: boolean; error?: string }>(GIT_CHANNELS.stage, [
      "../secret.ts",
    ]);
    expect(staged.ok).toBe(false);
    expect(staged.error).toMatch(/outside|invalid/i);
  });

  it("checkout rejects invalid branch names", async () => {
    const result = await harness.invoke<{ ok: boolean; error?: string }>(
      GIT_CHANNELS.checkout,
      "feat/ok",
      "-evil"
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/invalid/i);
  });

  it("branches() returns GitBranch objects", async () => {
    const branches = await harness.invoke<GitBranch[]>(GIT_CHANNELS.branches);
    expect(branches.length).toBeGreaterThan(0);
    expect(branches.every((branch) => typeof branch.name === "string" && branch.name.length > 0)).toBe(
      true
    );
  });
});
