import { describe, expect, it } from "vitest";
import { assertPathInWorkspace, pathsEqual, resolveWorkspacePath } from "../../src/main/path-security";

describe("path-security", () => {
  const root = "C:\\workspace\\proj";

  it("assertPathInWorkspace allows paths under root", () => {
    expect(assertPathInWorkspace(root, "C:\\workspace\\proj\\src\\a.ts")).toContain("src");
  });

  it("assertPathInWorkspace is case-insensitive on Windows", () => {
    if (process.platform !== "win32") return;
    expect(assertPathInWorkspace("C:\\Workspace\\Proj", "c:\\workspace\\proj\\src\\a.ts")).toContain(
      "src"
    );
    expect(pathsEqual("C:\\Workspace\\Proj", "c:\\workspace\\proj")).toBe(true);
  });

  it("assertPathInWorkspace rejects escape attempts", () => {
    expect(() => assertPathInWorkspace(root, "C:\\workspace\\other\\secret.txt")).toThrow(
      /outside workspace/i
    );
  });

  it("resolveWorkspacePath joins relative paths safely", () => {
    const resolved = resolveWorkspacePath(root, "src/index.ts");
    expect(resolved).toContain("index.ts");
  });
});
