/** Internal IPC channel names (main ↔ preload). Not exposed to renderer directly. */
export const PREVIEW_CHANNELS = {
  getState: "preview:get-state",
  start: "preview:start",
  stop: "preview:stop",
  restart: "preview:restart",
  getLogs: "preview:get-logs",
  openConfig: "preview:open-config",
  stateChanged: "preview:state-changed",
  logLine: "preview:log-line",
} as const;

export type PreviewIpcChannel = (typeof PREVIEW_CHANNELS)[keyof typeof PREVIEW_CHANNELS];
