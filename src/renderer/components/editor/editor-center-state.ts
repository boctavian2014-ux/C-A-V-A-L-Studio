export type EditorCenterKind =
  | "welcome"
  | "cad"
  | "ai-canvas"
  | "file-error"
  | "empty-workspace"
  | "load-error"
  | "monaco";

export function resolveEditorCenterState(input: {
  hasActiveTab: boolean;
  projectPath: string | null;
  hasFileReadError: boolean;
  loadTimedOut: boolean;
  monacoMounted: boolean;
  cadStlUrl: string | null;
  isStreaming: boolean;
}): EditorCenterKind {
  if (input.hasFileReadError) return "file-error";
  if (!input.hasActiveTab) {
    if (input.cadStlUrl) return "cad";
    if (input.isStreaming) return "ai-canvas";
    if (input.projectPath?.trim()) return "empty-workspace";
    return "welcome";
  }
  if (input.loadTimedOut && !input.monacoMounted) return "load-error";
  return "monaco";
}
