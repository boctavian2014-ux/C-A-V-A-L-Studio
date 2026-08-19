import { describe, expect, it } from "vitest";

import {
  isValidFilePath,
  isValidFilePathArray,
  isValidBranchName,
  isValidCommitMessage,
  isGitFileStatus,
} from "../../src/shared/git-security";

describe("isValidFilePath", () => {
  it("accepts relative paths", () => {
    expect(isValidFilePath("src/index.ts")).toBe(true);
    expect(isValidFilePath("README.md")).toBe(true);
  });

  it("rejects path traversal", () => {
    expect(isValidFilePath("../secrets.env")).toBe(false);
    expect(isValidFilePath("src/../../etc/passwd")).toBe(false);
  });

  it("rejects absolute paths", () => {
    expect(isValidFilePath("/etc/passwd")).toBe(false);
    expect(isValidFilePath("C:\\Windows\\System32")).toBe(false);
  });

  it("rejects empty or non-string", () => {
    expect(isValidFilePath("")).toBe(false);
    expect(isValidFilePath(123)).toBe(false);
    expect(isValidFilePath(null)).toBe(false);
  });
});

describe("isValidFilePathArray", () => {
  it("accepts array of valid paths", () => {
    expect(isValidFilePathArray(["src/a.ts", "src/b.ts"])).toBe(true);
  });

  it("rejects if any path is invalid", () => {
    expect(isValidFilePathArray(["src/a.ts", "../evil.ts"])).toBe(false);
  });

  it("rejects non-array", () => {
    expect(isValidFilePathArray("src/a.ts")).toBe(false);
  });
});

describe("isValidBranchName", () => {
  it("accepts valid branch names", () => {
    expect(isValidBranchName("feature/m3-git")).toBe(true);
    expect(isValidBranchName("main")).toBe(true);
  });

  it("rejects dangerous characters", () => {
    expect(isValidBranchName("branch with spaces")).toBe(false);
    expect(isValidBranchName("--upload-pack=evil")).toBe(false);
  });

  it("rejects leading dash to prevent CLI flag injection", () => {
    expect(isValidBranchName("-x")).toBe(false);
    expect(isValidBranchName("--upload-pack=evil")).toBe(false);
    expect(isValidBranchName("feature/m3-git")).toBe(true);
  });

  it("rejects path traversal patterns", () => {
    expect(isValidBranchName("feature/..")).toBe(false);
    expect(isValidBranchName("..")).toBe(false);
  });

  it("rejects leading/trailing dots and slashes", () => {
    expect(isValidBranchName(".hidden")).toBe(false);
    expect(isValidBranchName("branch/")).toBe(false);
  });
});

describe("isValidCommitMessage", () => {
  it("accepts non-empty messages", () => {
    expect(isValidCommitMessage("fix: resolve bug")).toBe(true);
  });

  it("rejects empty or whitespace-only", () => {
    expect(isValidCommitMessage("")).toBe(false);
    expect(isValidCommitMessage("   ")).toBe(false);
  });

  it("rejects excessively long messages", () => {
    expect(isValidCommitMessage("a".repeat(10001))).toBe(false);
  });
});

describe("isGitFileStatus", () => {
  it("accepts valid statuses", () => {
    expect(isGitFileStatus("modified")).toBe(true);
    expect(isGitFileStatus("untracked")).toBe(true);
  });

  it("rejects invalid statuses", () => {
    expect(isGitFileStatus("unknown-status")).toBe(false);
  });
});
