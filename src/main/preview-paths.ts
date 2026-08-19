import fs from "node:fs";

import { resolveSandboxedWorkspacePath } from "./path-security";
import { assertPreviewCwdInput } from "../shared/preview-security";
import { detectProject } from "./preview/project-detector";

export function resolvePreviewCwd(workspaceRoot: string, cwd: string | undefined): string {
  const input = assertPreviewCwdInput(cwd);
  const resolved = resolveSandboxedWorkspacePath(workspaceRoot, input);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolved);
  } catch {
    throw new Error("Preview cwd is not an existing directory inside the workspace");
  }
  if (!stat.isDirectory()) {
    throw new Error("Preview cwd is not an existing directory inside the workspace");
  }
  return fs.realpathSync(resolved);
}

export function looksLikeExpoProject(dir: string): boolean {
  try {
    return detectProject(dir).kind === "expo";
  } catch {
    return false;
  }
}
