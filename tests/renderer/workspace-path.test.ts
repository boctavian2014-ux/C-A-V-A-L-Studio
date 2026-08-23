import { describe, expect, it } from "vitest";

import {
  toWorkspaceDisplayPath,
  toWorkspaceRelativePath,
} from "../../src/renderer/utils/workspace-path";

describe("workspace-path utils", () => {
  const root = "C:\\Users\\dev\\fashion-matching-engine";

  it("converts absolute Windows paths to relative", () => {
    expect(
      toWorkspaceRelativePath(root, "C:\\Users\\dev\\fashion-matching-engine\\README.md")
    ).toBe("README.md");
  });

  it("accepts forward-slash relative paths cross-platform", () => {
    expect(toWorkspaceRelativePath(root, "src/components/App.tsx")).toBe("src/components/App.tsx");
  });

  it("rejects paths outside workspace", () => {
    expect(toWorkspaceRelativePath(root, "C:\\Users\\dev\\other\\README.md")).toBeNull();
    expect(toWorkspaceRelativePath(root, "../secret.txt")).toBeNull();
  });

  it("builds display paths for tabs", () => {
    expect(toWorkspaceDisplayPath(root, "README.md")).toBe(
      "C:\\Users\\dev\\fashion-matching-engine\\README.md"
    );
  });
});
