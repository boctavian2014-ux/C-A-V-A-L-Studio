import type { IpcMainInvokeEvent } from "electron";

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
