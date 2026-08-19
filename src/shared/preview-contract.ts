/**
 * M2 Preview IPC contract — shared by main, preload, and renderer.
 *
 * Security: the renderer must never send shell commands, cwd, or arbitrary URLs.
 * Those values are resolved in main from detectProject() + caval.jsonc.preview.
 */

export type PreviewTarget = "web" | "mobile";

export type PreviewStatus =
  | "not-configured"
  | "stopped"
  | "starting"
  | "running"
  | "failed";

export interface PreviewState {
  target: PreviewTarget;
  status: PreviewStatus;
  url: string | null;
  pid: number | null;
  startedAt: number | null;
  lastError: string | null;
}

export interface PreviewLogLine {
  target: PreviewTarget;
  stream: "stdout" | "stderr";
  line: string;
  timestamp: number;
}

export interface PreviewApi {
  getState(target: PreviewTarget): Promise<PreviewState>;
  start(target: PreviewTarget): Promise<PreviewState>;
  stop(target: PreviewTarget): Promise<PreviewState>;
  restart(target: PreviewTarget): Promise<PreviewState>;
  getLogs(target: PreviewTarget): Promise<PreviewLogLine[]>;
  openConfig(): Promise<void>;
  onStateChange(cb: (state: PreviewState) => void): () => void;
  onLog(cb: (line: PreviewLogLine) => void): () => void;
}

export function parsePreviewTarget(value: unknown): PreviewTarget {
  if (value === "web" || value === "mobile") return value;
  throw new Error("Invalid preview target");
}

export function isPreviewTarget(value: unknown): value is PreviewTarget {
  return value === "web" || value === "mobile";
}

export function idlePreviewState(target: PreviewTarget): PreviewState {
  return {
    target,
    status: "not-configured",
    url: null,
    pid: null,
    startedAt: null,
    lastError: null,
  };
}
