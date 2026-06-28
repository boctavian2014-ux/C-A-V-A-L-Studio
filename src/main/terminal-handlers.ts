import { ipcMain, BrowserWindow } from 'electron';
import * as pty from 'node-pty';
import * as os from 'os';

// Map de sesiuni terminal active
const sessions = new Map<string, pty.IPty>();

const SHELL = os.platform() === 'win32'
  ? 'powershell.exe'
  : process.env.SHELL || '/bin/bash';

ipcMain.handle('terminal:create', async (event, id: string) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return { ok: false, error: 'No window' };

  const ptyProcess = pty.spawn(SHELL, [], {
    name: 'xterm-256color',
    cols: 120,
    rows: 30,
    cwd: os.homedir(),
    env: { ...process.env } as Record<string, string>,
  });

  ptyProcess.onData((data) => {
    win.webContents.send(`terminal:data:${id}`, data);
  });

  sessions.set(id, ptyProcess);
  return { ok: true };
});

ipcMain.handle('terminal:write', async (_event, id: string, data: string) => {
  const session = sessions.get(id);
  if (!session) return { ok: false, error: 'Session not found' };
  session.write(data);
  return { ok: true };
});

ipcMain.handle('terminal:resize', async (_event, id: string, cols: number, rows: number) => {
  const session = sessions.get(id);
  if (!session) return { ok: false };
  const safeCols = Math.floor(cols);
  const safeRows = Math.floor(rows);
  if (safeCols < 1 || safeRows < 1) return { ok: false, skipped: true };
  session.resize(safeCols, safeRows);
  return { ok: true };
});

ipcMain.handle('terminal:destroy', async (_event, id: string) => {
  const session = sessions.get(id);
  if (session) {
    session.kill();
    sessions.delete(id);
  }
  return { ok: true };
});
