import fs from "node:fs";

import {
  WORKSPACE_FILE_READ_SAFE_MESSAGE,
  type WorkspaceFileReadErrorCode,
  type WorkspaceFileReadResult,
} from "../shared/workspace-file-read-contract";
import {
  assertTextContentSize,
  assertWorkspaceRelativeInput,
  languageFromRelativePath,
  requireSandboxedWorkspacePath,
} from "./path-security";

function mapReadFailure(err: unknown): WorkspaceFileReadResult {
  const message = err instanceof Error ? err.message : String(err);
  let code: WorkspaceFileReadErrorCode = "READ_FAILED";

  if (/No workspace open/i.test(message)) {
    code = "NO_WORKSPACE";
  } else if (/Path outside workspace/i.test(message)) {
    code = "OUTSIDE_WORKSPACE";
  } else if (
    typeof err === "object" &&
    err &&
    "code" in err &&
    (err as NodeJS.ErrnoException).code === "ENOENT"
  ) {
    code = "NOT_FOUND";
  } else if (/EISDIR|ENOTDIR|NOT_A_FILE/i.test(message)) {
    code = "NOT_A_FILE";
  } else if (/ENOENT/i.test(message)) {
    code = "NOT_FOUND";
  }

  return { ok: false, code, message: WORKSPACE_FILE_READ_SAFE_MESSAGE };
}

/** Bound-workspace read — relative path in, safe contract out. */
export function readWorkspaceFileRelative(
  workspaceRoot: string | undefined,
  relativePath: string
): WorkspaceFileReadResult {
  try {
    if (!workspaceRoot?.trim()) {
      return { ok: false, code: "NO_WORKSPACE", message: WORKSPACE_FILE_READ_SAFE_MESSAGE };
    }

    const relative = assertWorkspaceRelativeInput(relativePath);
    const target = requireSandboxedWorkspacePath(workspaceRoot, relative);

    let stat: fs.Stats;
    try {
      stat = fs.statSync(target);
    } catch (err) {
      return mapReadFailure(err);
    }

    if (!stat.isFile()) {
      return { ok: false, code: "NOT_A_FILE", message: WORKSPACE_FILE_READ_SAFE_MESSAGE };
    }

    const content = fs.readFileSync(target, "utf-8");
    assertTextContentSize(content, "file content");

    return {
      ok: true,
      path: relative.replace(/\\/g, "/"),
      content,
      language: languageFromRelativePath(relative),
    };
  } catch (err) {
    return mapReadFailure(err);
  }
}
