import { ipcMain, dialog, BrowserWindow, type IpcMainInvokeEvent } from "electron";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import { assertTrustedSender } from "./ipc-trust";
import {
  assertBatchFileCount,
  assertStlBase64Size,
  IPC_CONTENT_LIMITS,
  resolveInsideDir,
  resolveSandboxedWorkspacePath,
} from "./path-security";
import {
  getCatalogFromCacheOrCdn,
  getRoboticsLibraryCdnBase,
  resolveStandardComponent,
  ensureCachedFile,
} from "./robotics-library-cache";
import { sanitizeFileName } from "./engineering-handlers";

export function registerRoboticsLibraryHandlers(
  getBoundWorkspaceRoot: (senderId: number) => string | undefined
): void {
  const handle = (channel: string, fn: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown) => {
    ipcMain.handle(channel, (event, ...args) => {
      assertTrustedSender(event);
      return fn(event, ...args);
    });
  };

  handle("roboticsLibrary:cdnBase", async () => ({
    ok: true,
    base: getRoboticsLibraryCdnBase(),
  }));

  handle("roboticsLibrary:getCatalog", async () => getCatalogFromCacheOrCdn());

  handle("roboticsLibrary:ensureCached", async (_e, relPath: unknown) => {
    if (typeof relPath !== "string") return { ok: false, error: "relPath required" };
    return ensureCachedFile(relPath);
  });

  handle("roboticsLibrary:resolve", async (_e, standardKey: unknown) => {
    if (typeof standardKey !== "string") return { ok: false, error: "standardKey required" };
    return resolveStandardComponent(standardKey);
  });

  handle(
    "roboticsLibrary:saveStlToProject",
    async (
      event,
      input: unknown
    ): Promise<{ ok: boolean; savedPath?: string; error?: string }> => {
      const bound = getBoundWorkspaceRoot(event.sender.id)?.trim();
      if (!bound) return { ok: false, error: "No workspace open" };

      const body = input as {
        projectPath?: string;
        fileName?: string;
        base64?: string;
      };
      if (!body?.fileName || !body.base64) {
        return { ok: false, error: "fileName, base64 required" };
      }

      let projectRoot: string;
      try {
        projectRoot = body.projectPath?.trim()
          ? resolveSandboxedWorkspacePath(bound, body.projectPath)
          : resolveSandboxedWorkspacePath(bound, bound);
      } catch (err: unknown) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Path outside workspace",
        };
      }

      let buffer: Buffer;
      try {
        buffer = assertStlBase64Size(body.base64);
      } catch (err: unknown) {
        return { ok: false, error: err instanceof Error ? err.message : "STL too large" };
      }

      const outDir = path.join(projectRoot, "caval-engineering", "cad");
      await fs.mkdir(outDir, { recursive: true });
      const name = sanitizeFileName(body.fileName.endsWith(".stl") ? body.fileName : `${body.fileName}.stl`);
      const dest = resolveInsideDir(outDir, name);
      if (!dest) return { ok: false, error: "Invalid file name" };
      await fs.writeFile(dest, buffer);
      return { ok: true, savedPath: dest };
    }
  );

  handle(
    "roboticsLibrary:exportZip",
    async (
      event,
      input: unknown
    ): Promise<{ ok: boolean; savedPath?: string; canceled?: boolean; error?: string }> => {
      const body = input as {
        projectPath?: string;
        files?: Array<{ name: string; base64: string }>;
      };
      if (!body?.files?.length) return { ok: false, error: "No STL files to zip" };

      try {
        assertBatchFileCount(body.files.length);
      } catch (err: unknown) {
        return { ok: false, error: err instanceof Error ? err.message : "Too many files" };
      }

      const zip = new AdmZip();
      let totalBytes = 0;
      for (const f of body.files) {
        let buffer: Buffer;
        try {
          buffer = assertStlBase64Size(f.base64);
        } catch (err: unknown) {
          return {
            ok: false,
            error: err instanceof Error ? err.message : `STL too large: ${f.name}`,
          };
        }
        totalBytes += buffer.length;
        if (totalBytes > IPC_CONTENT_LIMITS.ZIP_TOTAL_BYTES) {
          return {
            ok: false,
            error: `ZIP aggregate exceeds limit (${totalBytes} > ${IPC_CONTENT_LIMITS.ZIP_TOTAL_BYTES} bytes)`,
          };
        }
        const name = sanitizeFileName(f.name.endsWith(".stl") ? f.name : `${f.name}.stl`);
        zip.addFile(name, buffer);
      }

      // In-workspace: path must be under bound root. Outside: ONLY native Save dialog.
      if (body.projectPath?.trim()) {
        const bound = getBoundWorkspaceRoot(event.sender.id)?.trim();
        if (!bound) return { ok: false, error: "No workspace open" };
        let projectRoot: string;
        try {
          projectRoot = resolveSandboxedWorkspacePath(bound, body.projectPath);
        } catch (err: unknown) {
          return {
            ok: false,
            error: err instanceof Error ? err.message : "Path outside workspace",
          };
        }
        const outDir = path.join(projectRoot, "caval-engineering", "cad");
        await fs.mkdir(outDir, { recursive: true });
        if (!fsSync.existsSync(outDir)) {
          return { ok: false, error: "Cannot create output directory" };
        }
        const dest = resolveInsideDir(outDir, "export-all.zip");
        if (!dest) return { ok: false, error: "Invalid output path" };
        zip.writeZip(dest);
        return { ok: true, savedPath: dest };
      }

      const window = BrowserWindow.fromWebContents(event.sender);
      const pick = window
        ? await dialog.showSaveDialog(window, {
            defaultPath: "cavallo-robotics-stl.zip",
            filters: [{ name: "ZIP", extensions: ["zip"] }],
          })
        : await dialog.showSaveDialog({
            defaultPath: "cavallo-robotics-stl.zip",
            filters: [{ name: "ZIP", extensions: ["zip"] }],
          });
      if (pick.canceled || !pick.filePath) return { ok: false, canceled: true };
      zip.writeZip(pick.filePath);
      return { ok: true, savedPath: pick.filePath };
    }
  );
}
