import type { PreviewTarget } from "./preview-contract";

export type { PreviewTarget } from "./preview-contract";

/** Legacy launcher UI status (sidebar until Pas 5). */
export type PreviewStatus = "stopped" | "starting" | "running" | "failed";

export type PreviewOpenMode = "external" | "window";

export interface CavalPreviewTargetConfig {
  enabled?: boolean;
  cwd?: string;
  command?: string;
  url?: string;
  openMode?: PreviewOpenMode;
  readyTimeoutMs?: number;
}

export interface CavalPreviewConfig {
  web?: CavalPreviewTargetConfig;
  mobile?: CavalPreviewTargetConfig;
}

export interface PreviewTargetState {
  target: PreviewTarget;
  configured: boolean;
  enabled: boolean;
  status: PreviewStatus;
  owned: boolean;
  url?: string;
  deepLink?: string;
  pid?: number;
  startedAt?: number;
  lastError?: string;
  logTail?: string;
  missingReason?: string;
}

export interface PreviewStatusResult {
  ok: boolean;
  error?: string;
  web: PreviewTargetState;
  mobile: PreviewTargetState;
}

export interface PreviewActionResult extends PreviewStatusResult {
  logs?: string;
  channel?: string;
  path?: string;
}

export const PREVIEW_STATUS_LABELS: Record<PreviewStatus, string> = {
  stopped: "Stopped",
  starting: "Starting",
  running: "Running",
  failed: "Failed",
};

export const PREVIEW_NOT_CONFIGURED: Record<PreviewTarget, string> = {
  web: "Web preview is not configured",
  mobile: "Mobile preview is not configured",
};
