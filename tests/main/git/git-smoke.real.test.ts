import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { GitService } from "../../../src/main/git/git-service";

const hasGit = (() => {
  try {
    execSync("git --version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
})();

function initSmokeRepo(dir: string) {
  execSync("git init", { cwd: dir, stdio: "pipe" });
  execSync('git config user.name "Test User"', { cwd: dir, stdio: "pipe" });
  execSync('git config user.email "test@example.com"', { cwd: dir, stdio: "pipe" });
  execSync("git config commit.gpgsign false", { cwd: dir, stdio: "pipe" });
  fs.writeFileSync(path.join(dir, "README.md"), "# Test\n", "utf8");
  execSync("git add README.md", { cwd: dir, stdio: "pipe" });
  execSync('git commit -m "initial commit"', { cwd: dir, stdio: "pipe" });
  fs.appendFileSync(path.join(dir, "README.md"), "change\n", "utf8");
  fs.writeFileSync(path.join(dir, "new-file.ts"), "new file\n", "utf8");
}

describe.skipIf(!hasGit)("git smoke — real repository (Pas 4.5.1)", () => {
  let repo: string;

  afterEach(() => {
    if (repo) fs.rmSync(repo, { recursive: true, force: true });
  });

  it("covers status, diff, stage, commit, log, and discard on a real repo", async () => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), "caval-git-smoke-"));
    initSmokeRepo(repo);
    const service = new GitService();

    const status1 = await service.status(repo);
    expect(["main", "master"]).toContain(status1.branch);
    expect(status1.isClean).toBe(false);
    expect(status1.files.some((f) => f.path === "README.md" && f.status === "modified" && !f.staged)).toBe(
      true
    );
    expect(
      status1.files.some((f) => f.path === "new-file.ts" && f.status === "untracked" && !f.staged)
    ).toBe(true);

    const diff = await service.diff(repo, "README.md", false);
    expect(diff.path).toBe("README.md");
    expect(diff.diff).toMatch(/\+change/);

    await service.stage(repo, ["README.md"]);
    const status2 = await service.status(repo);
    expect(status2.files.some((f) => f.path === "README.md" && f.staged)).toBe(true);
    expect(status2.files.some((f) => f.path === "new-file.ts" && !f.staged)).toBe(true);

    await service.stage(repo, ["new-file.ts"]);
    const status3 = await service.status(repo);
    expect(status3.files.filter((f) => f.staged).map((f) => f.path).sort()).toEqual([
      "README.md",
      "new-file.ts",
    ]);

    const committed = await service.commit(repo, { message: "test: smoke" });
    expect(committed.message).toBe("test: smoke");
    expect(committed.hash).toMatch(/^[a-f0-9]+$/);
    const status4 = await service.status(repo);
    expect(status4.isClean).toBe(true);
    expect(status4.files).toEqual([]);

    const log = await service.log(repo, 5);
    expect(log[0]?.message).toBe("test: smoke");

    fs.appendFileSync(path.join(repo, "README.md"), "discard-me\n", "utf8");
    const dirty = await service.status(repo);
    expect(dirty.files.some((f) => f.path === "README.md" && !f.staged)).toBe(true);
    await service.discardChanges(repo, ["README.md"]);
    const clean = await service.status(repo);
    expect(clean.isClean).toBe(true);
    expect(fs.readFileSync(path.join(repo, "README.md"), "utf8")).not.toMatch(/discard-me/);
  });
});
