import path from "node:path";
import { describe, expect, it } from "vitest";

import { normalizeGithubRepoUrl, repoTargetPath } from "../../src/main/github-clone";

describe("github-clone", () => {
  it("normalizes owner/repo shorthand", () => {
    const result = normalizeGithubRepoUrl("octocat/Hello-World");
    expect(result).toEqual({
      owner: "octocat",
      repo: "Hello-World",
      cloneUrl: "https://github.com/octocat/Hello-World.git",
    });
  });

  it("normalizes https github URLs", () => {
    const result = normalizeGithubRepoUrl("https://github.com/facebook/react.git");
    expect(result?.cloneUrl).toBe("https://github.com/facebook/react.git");
    expect(result?.repo).toBe("react");
  });

  it("rewrites GitHub SSH URLs to HTTPS", () => {
    expect(normalizeGithubRepoUrl("git@github.com:facebook/react.git")?.cloneUrl).toBe(
      "https://github.com/facebook/react.git"
    );
    expect(normalizeGithubRepoUrl("ssh://git@github.com/facebook/react.git")?.cloneUrl).toBe(
      "https://github.com/facebook/react.git"
    );
  });

  it("rejects invalid hosts and injection", () => {
    expect(normalizeGithubRepoUrl("https://gitlab.com/a/b")).toBeNull();
    expect(normalizeGithubRepoUrl("https://evil.com/repo.git")).toBeNull();
    expect(normalizeGithubRepoUrl("octocat/repo;rm -rf")).toBeNull();
    expect(normalizeGithubRepoUrl("")).toBeNull();
  });

  it("builds target path under parent", () => {
    const parent = path.resolve("dev");
    expect(repoTargetPath(parent, "Hello-World")).toBe(path.join(parent, "Hello-World"));
  });

  it("joins a Windows parent with path.win32 regardless of runner", () => {
    expect(path.win32.join("C:/dev", "Hello-World")).toBe("C:\\dev\\Hello-World");
    expect(repoTargetPath("C:/dev", "Hello-World")).toBe(path.join("C:/dev", "Hello-World"));
  });
});
