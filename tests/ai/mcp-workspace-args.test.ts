import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isGitRepository, resolveMcpServerArgs } from "../../ai/mcp/mcp-workspace-args";

describe("resolveMcpServerArgs", () => {
  it("replaces --repository . with workspace root", () => {
    const args = resolveMcpServerArgs(["mcp-server-git", "--repository", "."], "C:\\proj");
    expect(args).toEqual(["mcp-server-git", "--repository", path.resolve("C:\\proj")]);
  });
});

describe("isGitRepository", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns false when .git is missing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caval-mcp-"));
    dirs.push(dir);
    expect(isGitRepository(dir)).toBe(false);
  });

  it("returns true when .git exists", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caval-mcp-"));
    dirs.push(dir);
    fs.mkdirSync(path.join(dir, ".git"));
    expect(isGitRepository(dir)).toBe(true);
  });
});
