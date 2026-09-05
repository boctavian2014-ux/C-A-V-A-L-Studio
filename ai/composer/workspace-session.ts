export interface SessionFocusConfig {
  singleProjectFocus: boolean;
  newThreadOnWorkspaceChange: boolean;
}

export const DEFAULT_SESSION_FOCUS: SessionFocusConfig = {
  singleProjectFocus: true,
  newThreadOnWorkspaceChange: true,
};

export interface WorkspaceBoundThread {
  workspacePath?: string | null;
  messages?: Array<{ workspacePath?: string | null }>;
}

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

export function normalizeWorkspacePath(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  return value.trim().replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

export function workspaceFolderTitle(path: string | null): string {
  if (!path?.trim()) return 'Chat nou';
  return path.split(/[/\\]/).pop() ?? 'Chat nou';
}

/** Folder the restored chat was written in — thread bind, else last message bind. */
export function resolveThreadWorkspacePath(
  thread: WorkspaceBoundThread | null | undefined
): string | null {
  const fromThread = thread?.workspacePath?.trim();
  if (fromThread) return fromThread;
  const messages = thread?.messages;
  if (!messages?.length) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const fromMessage = messages[i]?.workspacePath?.trim();
    if (fromMessage) return fromMessage;
  }
  return null;
}

/** Open the chat's folder when Explorer has none or a different root. */
export function shouldRestoreThreadWorkspace(
  threadWorkspace: string | null | undefined,
  currentProjectPath: string | null | undefined
): boolean {
  const target = normalizeWorkspacePath(threadWorkspace);
  if (!target) return false;
  const current = normalizeWorkspacePath(currentProjectPath);
  return current !== target;
}
