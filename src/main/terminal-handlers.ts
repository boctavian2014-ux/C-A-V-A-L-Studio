import { ipcMain, BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import * as pty from 'node-pty';
import { sanitizeEnvForTerminal } from './subprocess-env';
import { assertTrustedSender } from './ipc-trust';
import {
  requireBoundWorkspaceRootFromEvent,
  type BoundWorkspaceRootGetter,
} from './bound-workspace';
import {
  ensureLatestPowerShellInstalled,
  resolvePreferredShell,
} from './powershell-shell';

/**
 * Interactive user terminal sessions (Zone A).
 * Isolated from automated AI runners (terminal-bridge / workspace-command-runner).
 * NO command allowlist — user may run arbitrary commands in their bound workspace.
 */
const sessions = new Map<string, pty.IPty>();

/** @internal test helper */
export function clearInteractiveTerminalSessionsForTests(): void {
  for (const session of sessions.values()) {
    try {
      session.kill();
    } catch {
      /* ignore */
    }
  }
  sessions.clear();
}

/** @internal test helper */
export function getInteractiveTerminalSessionCountForTests(): number {
  return sessions.size;
}

export function registerTerminalHandlers(getBoundWorkspaceRoot: BoundWorkspaceRootGetter): void {
  ipcMain.handle(
    'terminal:create',
    async (event: IpcMainInvokeEvent, id: string, _options?: { cwd?: string }) => {
      assertTrustedSender(event);
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) return { ok: false, error: 'No window' };

      // Lot B Zone A: cwd exclusively from bound workspace — ignore renderer cwd / homedir / process.cwd()
      let cwd: string;
      try {
        cwd = requireBoundWorkspaceRootFromEvent(
          event,
          getBoundWorkspaceRoot,
          'Deschide un folder în workspace înainte de a deschide terminalul.'
        );
      } catch (err: unknown) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }

      if (process.platform === 'win32') {
        const ensured = await ensureLatestPowerShellInstalled();
        if (!ensured.ok && ensured.error) {
          console.warn('[terminal] PowerShell 7 install:', ensured.error);
        }
      }

      // Controlled spawn: system shell as explicit executable — never shell:true for the shell itself
      const shell = resolvePreferredShell();
      const ptyProcess = pty.spawn(shell.command, shell.interactiveArgs, {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd,
        env: sanitizeEnvForTerminal() as Record<string, string>,
      });

      ptyProcess.onData((data) => {
        win.webContents.send(`terminal:data:${id}`, data);
      });

      sessions.set(id, ptyProcess);
      return { ok: true, shell: shell.label, kind: shell.kind, cwd };
    }
  );

  ipcMain.handle('terminal:write', async (event, id: string, data: string) => {
    assertTrustedSender(event);
    const session = sessions.get(id);
    if (!session) return { ok: false, error: 'Session not found' };
    session.write(data);
    return { ok: true };
  });

  ipcMain.handle('terminal:resize', async (event, id: string, cols: number, rows: number) => {
    assertTrustedSender(event);
    const session = sessions.get(id);
    if (!session) return { ok: false };
    const safeCols = Math.floor(cols);
    const safeRows = Math.floor(rows);
    if (safeCols < 1 || safeRows < 1) return { ok: false, skipped: true };
    session.resize(safeCols, safeRows);
    return { ok: true };
  });

  ipcMain.handle('terminal:destroy', async (event, id: string) => {
    assertTrustedSender(event);
    const session = sessions.get(id);
    if (session) {
      session.kill();
      sessions.delete(id);
    }
    return { ok: true };
  });

  ipcMain.handle('terminal:ensurePowerShell', async (event) => {
    assertTrustedSender(event);
    return ensureLatestPowerShellInstalled();
  });
}
