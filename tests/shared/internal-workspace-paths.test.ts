import { describe, expect, it } from "vitest";

import {
  isInternalWorkspacePath,
  pickWorkspaceStartupFile,
} from "../../src/shared/internal-workspace-paths";

describe("internal workspace paths", () => {
  const root = String.raw`C:\Users\octav\Desktop\WEBSITE CAVALLO`;

  it("treats context-cache documents as internal", () => {
    expect(isInternalWorkspacePath(".caval/context-cache/documents.json")).toBe(true);
    expect(isInternalWorkspacePath(".caval\\context-cache\\documents.json")).toBe(true);
    expect(
      isInternalWorkspacePath(`${root}\\.caval\\context-cache\\documents.json`, root)
    ).toBe(true);
    expect(isInternalWorkspacePath("caval/context-cache/documents.json")).toBe(true);
    expect(isInternalWorkspacePath(".cavalo/ai/workspace-index.json")).toBe(true);
    expect(isInternalWorkspacePath(".agent/memory.json")).toBe(true);
  });

  it("matches internal directories case-insensitively", () => {
    expect(isInternalWorkspacePath(".CAVAL/Context-Cache/documents.json")).toBe(true);
    expect(isInternalWorkspacePath(".CAVALO/ai/workspace-index.json")).toBe(true);
    expect(isInternalWorkspacePath("NODE_MODULES/pkg/index.js")).toBe(true);
  });

  it("does not treat user source files as internal", () => {
    expect(isInternalWorkspacePath("src/App.tsx")).toBe(false);
    expect(isInternalWorkspacePath(`${root}\\src\\App.tsx`, root)).toBe(false);
    expect(isInternalWorkspacePath("package.json")).toBe(false);
  });

  it("prefers README over cache JSON for startup", () => {
    const picked = pickWorkspaceStartupFile([
      { path: `${root}\\.caval\\context-cache\\documents.json`, label: ".caval\\context-cache\\documents.json" },
      { path: `${root}\\src\\App.tsx`, label: "src\\App.tsx" },
      { path: `${root}\\README.md`, label: "README.md" },
    ]);
    expect(picked?.label.replace(/\\/g, "/")).toBe("README.md");
  });

  it("returns no startup file when only internal files are present", () => {
    const picked = pickWorkspaceStartupFile([
      { path: `${root}\\.caval\\context-cache\\documents.json`, label: ".caval\\context-cache\\documents.json" },
      { path: `${root}\\.cavalo\\ai\\workspace-index.json`, label: ".cavalo\\ai\\workspace-index.json" },
    ]);
    expect(picked).toBeUndefined();
  });
});
