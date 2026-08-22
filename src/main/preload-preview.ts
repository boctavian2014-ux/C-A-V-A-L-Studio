import { ipcRenderer } from "electron";

import {
  isPreviewTarget,
  type PreviewApi,
  type PreviewLogLine,
  type PreviewState,
  type PreviewTarget,
} from "../shared/preview-contract";
import { PREVIEW_CHANNELS } from "../shared/preview-ipc-channels";

function assertTarget(target: PreviewTarget): void {
  if (!isPreviewTarget(target)) {
    throw new TypeError(`Invalid preview target: ${String(target)}`);
  }
}

export const previewApi: PreviewApi = {
  async getState(target) {
    assertTarget(target);
    return ipcRenderer.invoke(PREVIEW_CHANNELS.getState, target) as Promise<PreviewState>;
  },

  async start(target) {
    assertTarget(target);
    return ipcRenderer.invoke(PREVIEW_CHANNELS.start, target) as Promise<PreviewState>;
  },

  async stop(target) {
    assertTarget(target);
    return ipcRenderer.invoke(PREVIEW_CHANNELS.stop, target) as Promise<PreviewState>;
  },

  async restart(target) {
    assertTarget(target);
    return ipcRenderer.invoke(PREVIEW_CHANNELS.restart, target) as Promise<PreviewState>;
  },

  async getLogs(target) {
    assertTarget(target);
    return ipcRenderer.invoke(PREVIEW_CHANNELS.getLogs, target) as Promise<PreviewLogLine[]>;
  },

  async openConfig() {
    return ipcRenderer.invoke(PREVIEW_CHANNELS.openConfig) as Promise<void>;
  },

  async openUrl(target) {
    assertTarget(target);
    return ipcRenderer.invoke(PREVIEW_CHANNELS.openUrl, target) as Promise<void>;
  },

  onStateChange(cb) {
    const listener = (_event: Electron.IpcRendererEvent, state: PreviewState) => {
      cb(state);
    };
    ipcRenderer.on(PREVIEW_CHANNELS.stateChanged, listener);
    return () => {
      ipcRenderer.removeListener(PREVIEW_CHANNELS.stateChanged, listener);
    };
  },

  onLog(cb) {
    const listener = (_event: Electron.IpcRendererEvent, line: PreviewLogLine) => {
      cb(line);
    };
    ipcRenderer.on(PREVIEW_CHANNELS.logLine, listener);
    return () => {
      ipcRenderer.removeListener(PREVIEW_CHANNELS.logLine, listener);
    };
  },
};

/** @internal Exported for unit tests only. */
export function assertPreviewTarget(target: PreviewTarget): void {
  assertTarget(target);
}
