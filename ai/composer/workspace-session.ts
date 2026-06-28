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
  return bound !== current;
}

export function workspaceFolderTitle(path: string | null): string {
  if (!path?.trim()) return 'Chat nou';
  return path.split(/[/\\]/).pop() ?? 'Chat nou';
}
