import { describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";

import { assertPathInWorkspace, requireWorkspacePath, resolveWorkspacePath } from "../../src/main/path-security";

describe("path-security fs sandbox", () => {
  const workspace = path.join(os.tmpdir(), "caval-security-ws");

  it("resolves relative paths inside workspace", () => {
    const resolved = resolveWorkspacePath(workspace, "src/app.ts");
    expect(resolved).toBe(path.resolve(workspace, "src/app.ts"));
  });

  it("blocks path traversal outside workspace", () => {
    expect(() => resolveWorkspacePath(workspace, "../outside.txt")).toThrow(/outside workspace/i);
    expect(() => resolveWorkspacePath(workspace, "../../etc/passwd")).toThrow(/outside workspace/i);
  });

  it("requireWorkspacePath throws when workspace missing", () => {
    expect(() => requireWorkspacePath(undefined, "src/app.ts")).toThrow(/No workspace open/i);
    expect(() => requireWorkspacePath("", "src/app.ts")).toThrow(/No workspace open/i);
  });

  it("allows workspace root itself", () => {
    const resolved = assertPathInWorkspace(workspace, workspace);
    expect(resolved).toBe(path.resolve(workspace));
  });
});
