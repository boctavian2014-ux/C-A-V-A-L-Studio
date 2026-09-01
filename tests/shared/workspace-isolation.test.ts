import { describe, expect, it } from "vitest";

import {
  filterPathsInsideWorkspace,
  isInsideWorkspaceRoot,
  isSameWorkspaceRoot,
  resolveAuthoritativeWorkspaceRoot,
} from "../../src/shared/workspace-isolation";

describe("workspace-isolation", () => {
  it("treats relative files as inside and rejects ..", () => {
    expect(isInsideWorkspaceRoot("C:/proj", "src/App.tsx")).toBe(true);
    expect(isInsideWorkspaceRoot("C:/proj", "../other/secret.ts")).toBe(false);
    expect(isInsideWorkspaceRoot("C:/proj", "C:/proj/src/App.tsx")).toBe(true);
    expect(isInsideWorkspaceRoot("C:/proj", "C:/other/src/App.tsx")).toBe(false);
    expect(isInsideWorkspaceRoot("C:/caval studio", "C:/jocurii/package.json")).toBe(false);
  });

  it("ignores a spoofed renderer root and never falls back to cwd", () => {
    expect(
      resolveAuthoritativeWorkspaceRoot({
        boundRoot: "C:/jocurii",
        rendererRoot: "C:/caval studio",
      })
    ).toBe("C:/jocurii");
    expect(
      resolveAuthoritativeWorkspaceRoot({
        boundRoot: "",
        rendererRoot: "C:/caval studio",
      })
    ).toBe("");
  });

  it("filters mixed open-file lists to the bound folder", () => {
    expect(
      filterPathsInsideWorkspace("C:/jocurii", [
        "C:/jocurii/src/App.tsx",
        "C:/caval studio/ai/composer/ai-store.ts",
        "../secret.ts",
      ])
    ).toEqual(["C:/jocurii/src/App.tsx"]);
  });

  it("compares roots case-insensitively on Windows paths", () => {
    expect(isSameWorkspaceRoot("C:\\Jocurii", "c:/jocurii")).toBe(true);
    expect(isSameWorkspaceRoot("C:/a", "C:/b")).toBe(false);
  });
});
