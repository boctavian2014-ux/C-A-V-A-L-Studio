import { ipcMain, dialog, shell, BrowserWindow } from "electron";
import * as fs from "fs";

import { readDirTree } from "./fs-tree";
import { assertPathInWorkspace, resolveWorkspacePath } from "./path-security";
import { parseIpcInput, fsPathSchema, fsReadFileSchema, fsRenameSchema, fsWriteFileSchema } from "./ipc-schemas";
import { recordAudit, persistAuditLog } from "./audit-log";

const workspaceForSender = new Map<number, string>();

export function setIpcWorkspaceRoot(senderId: number, root: string): void {
  workspaceForSender.set(senderId, root);
}

export function getIpcWorkspaceRoot(senderId: number): string | undefined {
  return workspaceForSender.get(senderId);
}

function auditFs(channel: string, senderId: number, targetPath: string, ok: boolean, detail?: string): void {
  recordAudit({
    channel,
    action: "fs",
    workspaceRoot: workspaceForSender.get(senderId),
    detail: detail ?? targetPath,
    ok,
  });
}

/** Selectează unul sau mai multe fișiere (atașamente chat, import, etc.) */
ipcMain.handle("fs:pickFiles", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const result = window
    ? await dialog.showOpenDialog(window, {
        title: "Selectează fișiere",
        properties: ["openFile", "multiSelections"],
        filters: [
          {
            name: "Code and text",
            extensions: ["ts", "tsx", "js", "jsx", "json", "md", "css", "html", "py", "go", "rs", "java", "txt", "xml", "yaml", "yml"],
          },
          { name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"] },
          { name: "All files", extensions: ["*"] },
        ],
      })
    : await dialog.showOpenDialog({
        title: "Selectează fișiere",
        properties: ["openFile", "multiSelections"],
        filters: [
          {
            name: "Code and text",
            extensions: ["ts", "tsx", "js", "jsx", "json", "md", "css", "html", "py", "go", "rs", "java", "txt", "xml", "yaml", "yml"],
          },
          { name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"] },
          { name: "All files", extensions: ["*"] },
        ],
      });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths;
});

/** Deschide un dialog de selectare folder și returnează calea */
ipcMain.handle("fs:openFolder", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"],
    title: "Deschide proiect",
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

/** Citește recursiv structura unui director și returnează un arbore JSON */
ipcMain.handle("fs:readTree", async (_event, dirPath: string) => {
  return readDirTree(dirPath, dirPath);
});

/** Citește conținutul unui fișier text */
ipcMain.handle("fs:readFile", async (event, filePath: string) => {
  try {
    const { filePath: validated } = parseIpcInput(fsReadFileSchema, { filePath });
    const root = workspaceForSender.get(event.sender.id);
    if (root) resolveWorkspacePath(root, validated);
    const content = fs.readFileSync(validated, "utf-8");
    auditFs("fs:readFile", event.sender.id, validated, true);
    return { ok: true, content };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    auditFs("fs:readFile", event.sender.id, filePath, false, message);
    return { ok: false, error: message };
  }
});

/** Salvează conținut într-un fișier */
ipcMain.handle("fs:writeFile", async (event, filePath: string, content: string) => {
  try {
    const parsed = parseIpcInput(fsWriteFileSchema, { filePath, content });
    const root = workspaceForSender.get(event.sender.id);
    const target = root ? resolveWorkspacePath(root, parsed.filePath) : parsed.filePath;
    fs.writeFileSync(target, parsed.content, "utf-8");
    auditFs("fs:writeFile", event.sender.id, target, true);
    const ws = workspaceForSender.get(event.sender.id);
    if (ws) void persistAuditLog(ws);
    return { ok: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    auditFs("fs:writeFile", event.sender.id, filePath, false, message);
    return { ok: false, error: message };
  }
});

/** Creează un fișier nou gol */
ipcMain.handle("fs:createFile", async (event, filePath: string) => {
  try {
    const { targetPath } = parseIpcInput(fsPathSchema, { targetPath: filePath });
    const root = workspaceForSender.get(event.sender.id);
    const target = root ? resolveWorkspacePath(root, targetPath) : targetPath;
    fs.writeFileSync(target, "", "utf-8");
    auditFs("fs:createFile", event.sender.id, target, true);
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

/** Creează un director nou */
ipcMain.handle("fs:createDir", async (event, dirPath: string) => {
  try {
    const { targetPath } = parseIpcInput(fsPathSchema, { targetPath: dirPath });
    const root = workspaceForSender.get(event.sender.id);
    const target = root ? resolveWorkspacePath(root, targetPath) : targetPath;
    fs.mkdirSync(target, { recursive: true });
    auditFs("fs:createDir", event.sender.id, target, true);
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

/** Redenumește / mută un fișier sau director */
ipcMain.handle("fs:rename", async (event, oldPath: string, newPath: string) => {
  try {
    const parsed = parseIpcInput(fsRenameSchema, { oldPath, newPath });
    const root = workspaceForSender.get(event.sender.id);
    const from = root ? resolveWorkspacePath(root, parsed.oldPath) : parsed.oldPath;
    const to = root ? resolveWorkspacePath(root, parsed.newPath) : parsed.newPath;
    fs.renameSync(from, to);
    auditFs("fs:rename", event.sender.id, `${from} -> ${to}`, true);
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

/** Șterge un fișier sau director */
ipcMain.handle("fs:delete", async (event, targetPath: string) => {
  try {
    const { targetPath: validated } = parseIpcInput(fsPathSchema, { targetPath });
    const root = workspaceForSender.get(event.sender.id);
    const target = root ? resolveWorkspacePath(root, validated) : validated;
    if (root) assertPathInWorkspace(root, target);
    fs.rmSync(target, { recursive: true, force: true });
    auditFs("fs:delete", event.sender.id, target, true);
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

/** Deschide fișier în file explorer nativ */
ipcMain.handle("fs:reveal", async (_event, filePath: string) => {
  shell.showItemInFolder(filePath);
  return { ok: true };
});

ipcMain.handle("window:minimize", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});

ipcMain.handle("window:maximize", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  if (win.isMaximized()) {
    win.unmaximize();
  } else {
    win.maximize();
  }
});

ipcMain.handle("window:close", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});

export type { FileNode } from "./fs-tree";
