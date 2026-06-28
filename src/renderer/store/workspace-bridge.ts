/** Evită import circular editor-store ↔ ai-store la schimbare workspace. */
let workspaceChangeHandler: ((path: string | null) => void) | null = null;

export function registerWorkspaceChangeHandler(
  handler: (path: string | null) => void
): void {
  workspaceChangeHandler = handler;
}

export function notifyWorkspaceChanged(path: string | null): void {
  workspaceChangeHandler?.(path);
}
