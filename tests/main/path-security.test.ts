import { describe, expect, it } from "vitest";
import { assertPathInWorkspace, resolveWorkspacePath } from "../../src/main/path-security";

describe("path-security", () => {
  const root = "C:\\workspace\\proj";

  it("assertPathInWorkspace allows paths under root", () => {
    expect(assertPathInWorkspace(root, "C:\\workspace\\proj\\src\\a.ts")).toContain("src");
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
