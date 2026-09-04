import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  peekBoundWorkspaceRoot,
  requireBoundWorkspaceRoot,
  resolveRequiredBoundWorkspace,
  WORKSPACE_NOT_BOUND_CODE,
} from "../../src/main/bound-workspace";
import { NO_BOUND_WORKSPACE_ERROR } from "../../src/shared/workspace-isolation";
import { normalizeWorkspaceRoot } from "../../src/main/path-security";

describe("bound workspace lookup", () => {
  it("peeks undefined when no root is bound", () => {
    expect(peekBoundWorkspaceRoot(() => undefined, 1)).toBeUndefined();
  });

  it("does not treat process.cwd() as an implicit bound root", () => {
    const roots = new Map<number, string>();
    expect(peekBoundWorkspaceRoot((id) => roots.get(id), 7)).toBeUndefined();
    const refused = resolveRequiredBoundWorkspace((id) => roots.get(id), 7, process.cwd());
    expect(refused).toEqual({
      ok: false,
      error: NO_BOUND_WORKSPACE_ERROR,
      code: WORKSPACE_NOT_BOUND_CODE,
    });
  });

  it("returns the bound root and ignores a spoofed renderer cwd", () => {
    const bound = normalizeWorkspaceRoot(path.join(os.tmpdir(), "caval-bound-ws"));
    const roots = new Map<number, string>([[3, bound]]);
    const resolved = resolveRequiredBoundWorkspace((id) => roots.get(id), 3, process.cwd());
    expect(resolved).toEqual({ ok: true, workspaceRoot: bound });
    expect(requireBoundWorkspaceRoot((id) => roots.get(id), 3)).toBe(bound);
  });
});
