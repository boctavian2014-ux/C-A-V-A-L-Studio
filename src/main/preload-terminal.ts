import { ipcRenderer } from "electron";

import type {
  TerminalApi,
  TerminalCreateOptions,
  TerminalInfo,
  TerminalOutputLine,
} from "../shared/terminal-contract";
import { isTerminalId } from "../shared/terminal-contract";
import { TERMINAL_CHANNELS } from "../shared/terminal-ipc-channels";

export function assertTerminalId(id: string): void {
  if (!isTerminalId(id)) {
    throw new TypeError("Invalid terminal id");
  }
}

export const terminalApi: TerminalApi = {
  async create(options) {
    return ipcRenderer.invoke(TERMINAL_CHANNELS.create, options ?? {}) as Promise<TerminalInfo>;
  },

  async write(terminalId, data) {
    assertTerminalId(terminalId);
    await ipcRenderer.invoke(TERMINAL_CHANNELS.write, terminalId, data);
  },

  async resize(terminalId, cols, rows) {
    assertTerminalId(terminalId);
    await ipcRenderer.invoke(TERMINAL_CHANNELS.resize, terminalId, cols, rows);
  },

  async destroy(terminalId) {
    assertTerminalId(terminalId);
    await ipcRenderer.invoke(TERMINAL_CHANNELS.destroy, terminalId);
  },

  async getInfo(terminalId) {
    assertTerminalId(terminalId);
    return ipcRenderer.invoke(TERMINAL_CHANNELS.getInfo, terminalId) as Promise<TerminalInfo>;
  },

  async list() {
    return ipcRenderer.invoke(TERMINAL_CHANNELS.list) as Promise<TerminalInfo[]>;
  },

  onOutput(cb) {
    const listener = (_event: Electron.IpcRendererEvent, line: TerminalOutputLine) => {
      cb(line);
    };
    ipcRenderer.on(TERMINAL_CHANNELS.output, listener);
    return () => {
      ipcRenderer.removeListener(TERMINAL_CHANNELS.output, listener);
    };
  },

  onExit(cb) {
    const listener = (_event: Electron.IpcRendererEvent, info: TerminalInfo) => {
      cb(info);
    };
    ipcRenderer.on(TERMINAL_CHANNELS.exit, listener);
    return () => {
      ipcRenderer.removeListener(TERMINAL_CHANNELS.exit, listener);
    };
  },
};

/**
 * Current TerminalSession still calls create(id, options) and onData(id).
 * Keep those until Pas 3 switches the UI to TerminalApi.
 */
export const cavalTerminalPreload = {
  ...terminalApi,
  create(
    idOrOptions?: string | TerminalCreateOptions,
    maybeOptions?: TerminalCreateOptions
  ): Promise<TerminalInfo> {
    if (typeof idOrOptions === "string") {
      assertTerminalId(idOrOptions);
      return ipcRenderer.invoke(
        TERMINAL_CHANNELS.create,
        idOrOptions,
        maybeOptions
      ) as Promise<TerminalInfo>;
    }
    return terminalApi.create(idOrOptions ?? {});
  },
  ensurePowerShell: () => ipcRenderer.invoke("terminal:ensurePowerShell"),
  onData(id: string, cb: (data: string) => void) {
    assertTerminalId(id);
    const channel = `terminal:data:${id}`;
    const listener = (_event: Electron.IpcRendererEvent, data: string) => cb(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
};
