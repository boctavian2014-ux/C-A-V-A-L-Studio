import { ipcMain, dialog, shell, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

// ──────────────────────────────────────────────
//  FILE SYSTEM HANDLERS
// ──────────────────────────────────────────────

/** Deschide un dialog de selectare folder și returnează calea */
ipcMain.handle('fs:openFolder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Deschide proiect',
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

/** Citește recursiv structura unui director și returnează un arbore JSON */
ipcMain.handle('fs:readTree', async (_event, dirPath: string) => {
  return readDirTree(dirPath, dirPath);
});

/** Citește conținutul unui fișier text */
ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { ok: true, content };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
});

/** Salvează conținut într-un fișier */
ipcMain.handle('fs:writeFile', async (_event, filePath: string, content: string) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
});

/** Creează un fișier nou gol */
ipcMain.handle('fs:createFile', async (_event, filePath: string) => {
  try {
    fs.writeFileSync(filePath, '', 'utf-8');
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
});

/** Creează un director nou */
ipcMain.handle('fs:createDir', async (_event, dirPath: string) => {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
});

/** Redenumește / mută un fișier sau director */
ipcMain.handle('fs:rename', async (_event, oldPath: string, newPath: string) => {
  try {
    fs.renameSync(oldPath, newPath);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
});

/** Șterge un fișier sau director */
ipcMain.handle('fs:delete', async (_event, targetPath: string) => {
  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
});

/** Deschide fișier în file explorer nativ */
ipcMain.handle('fs:reveal', async (_event, filePath: string) => {
  shell.showItemInFolder(filePath);
  return { ok: true };
});

ipcMain.handle('window:minimize', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});

ipcMain.handle('window:maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  if (win.isMaximized()) {
    win.unmaximize();
  } else {
    win.maximize();
  }
});

ipcMain.handle('window:close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});

// ──────────────────────────────────────────────
//  HELPER: citire recursivă director
// ──────────────────────────────────────────────

const IGNORE = new Set([
  'node_modules', '.git', 'dist', '.next', '__pycache__',
  '.DS_Store', 'coverage', '.turbo', '.cache',
]);

export interface FileNode {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'directory';
  ext?: string;
  children?: FileNode[];
}

function readDirTree(dirPath: string, rootPath: string, depth = 0): FileNode[] {
  if (depth > 8) return []; // protecție împotriva adâncimii excesive
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const nodes: FileNode[] = [];

    for (const entry of entries) {
      if (IGNORE.has(entry.name)) continue;

      const fullPath = path.join(dirPath, entry.name);
      const relPath = path.relative(rootPath, fullPath);

      if (entry.isDirectory()) {
        nodes.push({
          id: relPath,
          name: entry.name,
          path: fullPath,
          type: 'directory',
          children: readDirTree(fullPath, rootPath, depth + 1),
        });
      } else {
        const ext = path.extname(entry.name).slice(1);
        nodes.push({
          id: relPath,
          name: entry.name,
          path: fullPath,
          type: 'file',
          ext,
        });
      }
    }

    // Sortare: directoare înainte, apoi fișiere, ambele alfabetic
    return nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  } catch {
    return [];
  }
}
