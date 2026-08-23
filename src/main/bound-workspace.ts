import fs from "node:fs";
import type { IpcMainInvokeEvent } from "electron";

import { isUrlLikeWorkspacePath } from "../shared/workspace-discovery-contract";
import { normalizeWorkspaceRoot } from "./path-security";

export type BoundWorkspaceRootGetter = (senderId: number) => string | undefined;

/** Bound workspace root only — never process.cwd() / homedir / renderer path fallback. */
export function requireBoundWorkspaceRoot(
  getBoundWorkspaceRoot: BoundWorkspaceRootGetter,
  senderId: number,
  message = "No workspace open. Open a folder before running this action."
): string {
  const root = getBoundWorkspaceRoot(senderId)?.trim();
  if (!root) {
    throw new Error(message);
  }
  return normalizeWorkspaceRoot(root);
}

export function requireBoundWorkspaceRootFromEvent(
  event: IpcMainInvokeEvent,
  getBoundWorkspaceRoot: BoundWorkspaceRootGetter,
  message?: string
): string {
  return requireBoundWorkspaceRoot(getBoundWorkspaceRoot, event.sender.id, message);
}

/**
 * SEC-IPC-WS-BINDING-001 — only an existing local directory may become the bound root.
 * Call after assertTrustedSender; never bind a renderer-supplied file or missing path.
 */
export function resolveBindableWorkspaceDirectory(folderPath: unknown): string {
  if (typeof folderPath !== "string" || !folderPath.trim()) {
    throw new Error("Invalid folder path");
  }
  if (isUrlLikeWorkspacePath(folderPath)) {
    throw new Error("Workspace path must be a local directory, not a URL");
  }
  const root = normalizeWorkspaceRoot(folderPath);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(root);
  } catch {
    throw new Error("Workspace path is not an accessible directory");
  }
  if (!stat.isDirectory()) {
    throw new Error("Workspace path is not an accessible directory");
  }
  return root;
}
