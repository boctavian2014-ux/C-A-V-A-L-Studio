export interface SessionFocusConfig {
  singleProjectFocus: boolean;
  newThreadOnWorkspaceChange: boolean;
}

export const DEFAULT_SESSION_FOCUS: SessionFocusConfig = {
  singleProjectFocus: true,
  newThreadOnWorkspaceChange: true,
};

/** True when the stream was started for a different workspace than the one now open. */
export function isStaleWorkspace(
  bound: string | null,
  current: string | null
): boolean {
  const a = normalizeWorkspacePath(bound);
  const b = normalizeWorkspacePath(current);
  if (a === b) return false;
  // Stream started before the folder finished binding — apply to the newly opened root.
  if (!a && b) return false;
  return true;
}

function normalizeWorkspacePath(value: string | null): string | null {
  if (!value?.trim()) return null;
  return value.trim().replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

export function workspaceFolderTitle(path: string | null): string {
  if (!path?.trim()) return 'Chat nou';
  return path.split(/[/\\]/).pop() ?? 'Chat nou';
}
