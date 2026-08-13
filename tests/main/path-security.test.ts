import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertPathInWorkspace, pathsEqual, resolveWorkspacePath } from "../../src/main/path-security";

describe("path-security", () => {
  const root = path.resolve("workspace-proj");

  it("assertPathInWorkspace allows paths under root", () => {
    const nested = path.join(root, "src", "a.ts");
    expect(path.normalize(assertPathInWorkspace(root, nested))).toBe(path.normalize(nested));
  });

  it("parses Windows serialized workspace paths with path.win32", () => {
    const winRoot = "C:\\Workspace\\Proj";
    const nested = path.win32.join(winRoot, "src", "a.ts");
    const escaped = path.win32.join("C:\\Workspace", "other", "secret.txt");
    expect(path.win32.isAbsolute(winRoot)).toBe(true);
    expect(nested).toBe("C:\\Workspace\\Proj\\src\\a.ts");
    expect(path.win32.basename(nested)).toBe("a.ts");
    expect(path.win32.relative(winRoot, escaped).startsWith("..")).toBe(true);
    expect(path.win32.resolve(winRoot).toLowerCase()).toBe(
      path.win32.resolve("c:\\workspace\\proj").toLowerCase()
    );
  });

  it("assertPathInWorkspace rejects escape attempts", () => {
    expect(() =>
      assertPathInWorkspace(root, path.resolve(root, "..", "other", "secret.txt"))
    ).toThrow(/outside workspace/i);
  });

  it("resolveWorkspacePath joins relative posix segments onto the local root", () => {
    const relative = path.posix.join("src", "index.ts");
    const resolved = resolveWorkspacePath(root, relative);
    expect(path.normalize(resolved)).toBe(path.normalize(path.join(root, "src", "index.ts")));
  });

  it("pathsEqual matches two resolved forms of the same location", () => {
    expect(pathsEqual(root, path.join(root, "."))).toBe(true);
  });
});
