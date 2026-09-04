import fs from "node:fs";
import type { IpcMainInvokeEvent } from "electron";

import { isUrlLikeWorkspacePath } from "../shared/workspace-discovery-contract";
import {
  NO_BOUND_WORKSPACE_ERROR,
  resolveAuthoritativeWorkspaceRoot,
} from "../shared/workspace-isolation";
import { normalizeWorkspaceRoot } from "./path-security";

export type BoundWorkspaceRootGetter = (senderId: number) => string | undefined;

export const WORKSPACE_NOT_BOUND_CODE = "workspace_not_bound" as const;

export type BoundWorkspaceResult =
  | { ok: true; workspaceRoot: string }
  | { ok: false; error: string; code: typeof WORKSPACE_NOT_BOUND_CODE };

/** Bound workspace root only — never process.cwd() / homedir / renderer path fallback. */
export function peekBoundWorkspaceRoot(
  getBoundWorkspaceRoot: BoundWorkspaceRootGetter,
  senderId: number
): string | undefined {
  const root = getBoundWorkspaceRoot(senderId)?.trim();
  return root ? normalizeWorkspaceRoot(root) : undefined;
}

export function unboundWorkspaceResult(): Extract<BoundWorkspaceResult, { ok: false }> {
  return {
    ok: false,
    error: NO_BOUND_WORKSPACE_ERROR,
    code: WORKSPACE_NOT_BOUND_CODE,
  };
}

/**
 * Bound folder wins. Empty bound root is a hard refusal — never cwd, never a
 * renderer-supplied path that does not match the bound folder.
 */
export function resolveRequiredBoundWorkspace(
  getBoundWorkspaceRoot: BoundWorkspaceRootGetter,
  senderId: number,
  rendererRoot?: string | null
): BoundWorkspaceResult {
  const workspaceRoot = resolveAuthoritativeWorkspaceRoot({
    boundRoot: peekBoundWorkspaceRoot(getBoundWorkspaceRoot, senderId),
    rendererRoot,
  });
  if (!workspaceRoot) {
    return unboundWorkspaceResult();
  }
  return { ok: true, workspaceRoot };
}

export function requireBoundWorkspaceRoot(
  getBoundWorkspaceRoot: BoundWorkspaceRootGetter,
  senderId: number,
  message = "No workspace open. Open a folder before running this action."
): string {
  const root = peekBoundWorkspaceRoot(getBoundWorkspaceRoot, senderId);
  if (!root) {
    throw new Error(message);
  }
  return root;
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
