import { randomUUID } from "node:crypto";
import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";

import type { TerminalCreateOptions, TerminalInfo, TerminalOutputLine } from "../shared/terminal-contract";
import { TERMINAL_CHANNELS } from "../shared/terminal-ipc-channels";
import {
  requireBoundWorkspaceRootFromEvent,
  type BoundWorkspaceRootGetter,
} from "./bound-workspace";
import { assertTrustedSender } from "./ipc-trust";
import { ensureLatestPowerShellInstalled } from "./powershell-shell";
import {
  interactiveTerminalService,
  stopAllInteractiveTerminals,
  stopAllInteractiveTerminalsSync,
} from "./terminal/interactive-terminal-service";

export { stopAllInteractiveTerminals, stopAllInteractiveTerminalsSync };

export function clearInteractiveTerminalSessionsForTests(): void {
  interactiveTerminalService.destroyAll();
}

/** @internal test helper */
export function getInteractiveTerminalSessionCountForTests(): number {
  return interactiveTerminalService.sessionCount();
}

function createOptionsFromIpc(
  idOrOptions?: unknown,
  maybeOptions?: unknown
): TerminalCreateOptions {
  if (typeof idOrOptions === "string") {
    return maybeOptions && typeof maybeOptions === "object"
      ? (maybeOptions as TerminalCreateOptions)
      : {};
  }
  if (idOrOptions && typeof idOrOptions === "object") {
    return idOrOptions as TerminalCreateOptions;
  }
  return {};
}

function broadcastTerminal(channel: string, payload: unknown): void {
  const windows =
    typeof BrowserWindow.getAllWindows === "function" ? BrowserWindow.getAllWindows() : [];
  for (const win of windows) {
    if (typeof win.isDestroyed === "function" && win.isDestroyed()) continue;
    win.webContents.send(channel, payload);
  }
}

export function registerTerminalHandlers(getBoundWorkspaceRoot: BoundWorkspaceRootGetter): void {
  ipcMain.handle(
    TERMINAL_CHANNELS.create,
    async (event: IpcMainInvokeEvent, idOrOptions?: unknown, maybeOptions?: unknown) => {
      assertTrustedSender(event);
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) return { ok: false, error: "No window" };

      let cwd: string;
      try {
        cwd = requireBoundWorkspaceRootFromEvent(
          event,
          getBoundWorkspaceRoot,
          "Deschide un folder în workspace înainte de a deschide terminalul."
        );
      } catch (err: unknown) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }

      if (process.platform === "win32") {
        const ensured = await ensureLatestPowerShellInstalled();
        if (!ensured.ok && ensured.error) {
          console.warn("[terminal] PowerShell 7 install:", ensured.error);
        }
      }

      const options = createOptionsFromIpc(idOrOptions, maybeOptions);
      const id = `term-${randomUUID()}`;
      const info = interactiveTerminalService.create({
        id,
        cwd,
        title: options.title,
        onData: (data) => {
          const line: TerminalOutputLine = { terminalId: id, data, timestamp: Date.now() };
          broadcastTerminal(TERMINAL_CHANNELS.output, line);
        },
        onExit: (exited) => {
          broadcastTerminal(TERMINAL_CHANNELS.exit, exited);
        },
      });
      return { ...info, ok: true };
    }
  );

  ipcMain.handle(TERMINAL_CHANNELS.write, async (event, terminalId: string, data: string) => {
    assertTrustedSender(event);
    return interactiveTerminalService.write(terminalId, data);
  });

  ipcMain.handle(
    TERMINAL_CHANNELS.resize,
    async (event, terminalId: string, cols: number, rows: number) => {
      assertTrustedSender(event);
      return interactiveTerminalService.resize(terminalId, cols, rows);
    }
  );

  ipcMain.handle(TERMINAL_CHANNELS.destroy, async (event, terminalId: string) => {
    assertTrustedSender(event);
    return interactiveTerminalService.destroy(terminalId);
  });

  ipcMain.handle(TERMINAL_CHANNELS.getInfo, async (event, terminalId: string) => {
    assertTrustedSender(event);
    return interactiveTerminalService.getInfo(terminalId);
  });

  ipcMain.handle(TERMINAL_CHANNELS.list, async (event) => {
    assertTrustedSender(event);
    return interactiveTerminalService.list();
  });

  ipcMain.handle("terminal:ensurePowerShell", async (event) => {
    assertTrustedSender(event);
    return ensureLatestPowerShellInstalled();
  });
}

export type { TerminalInfo };
