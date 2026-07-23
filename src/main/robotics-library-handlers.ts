import { ipcMain, type IpcMainInvokeEvent } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";
import { assertTrustedSender } from "./ipc-trust";
import {
  getCatalogFromCacheOrCdn,
  getRoboticsLibraryCdnBase,
  resolveStandardComponent,
  ensureCachedFile,
} from "./robotics-library-cache";
import { sanitizeFileName } from "./engineering-handlers";

function resolveInsideDir(dir: string, fileName: string): string | null {
  const resolved = path.resolve(dir, fileName);
  const rel = path.relative(dir, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return resolved;
}

export function registerRoboticsLibraryHandlers(): void {
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
      _e,
      input: unknown
    ): Promise<{ ok: boolean; savedPath?: string; error?: string }> => {
      const body = input as {
        projectPath?: string;
        fileName?: string;
        base64?: string;
      };
      if (!body?.projectPath || !body.fileName || !body.base64) {
        return { ok: false, error: "projectPath, fileName, base64 required" };
      }
      const outDir = path.join(body.projectPath, "caval-engineering", "cad");
      await fs.mkdir(outDir, { recursive: true });
      const name = sanitizeFileName(body.fileName.endsWith(".stl") ? body.fileName : `${body.fileName}.stl`);
      const dest = resolveInsideDir(outDir, name);
      if (!dest) return { ok: false, error: "Invalid file name" };
      await fs.writeFile(dest, Buffer.from(body.base64, "base64"));
      return { ok: true, savedPath: dest };
    }
  );

  handle(
    "roboticsLibrary:exportZip",
    async (
      _e,
      input: unknown
    ): Promise<{ ok: boolean; savedPath?: string; canceled?: boolean; error?: string }> => {
      const body = input as {
        projectPath?: string;
        files?: Array<{ name: string; base64: string }>;
      };
      if (!body?.files?.length) return { ok: false, error: "No STL files to zip" };

      const zip = new AdmZip();
      for (const f of body.files) {
        const name = sanitizeFileName(f.name.endsWith(".stl") ? f.name : `${f.name}.stl`);
        zip.addFile(name, Buffer.from(f.base64, "base64"));
      }

      if (body.projectPath) {
        const outDir = path.join(body.projectPath, "caval-engineering", "cad");
        await fs.mkdir(outDir, { recursive: true });
        const dest = path.join(outDir, "export-all.zip");
        zip.writeZip(dest);
        return { ok: true, savedPath: dest };
      }

      const { dialog } = await import("electron");
      const pick = await dialog.showSaveDialog({
        defaultPath: "cavallo-robotics-stl.zip",
        filters: [{ name: "ZIP", extensions: ["zip"] }],
      });
      if (pick.canceled || !pick.filePath) return { ok: false, canceled: true };
      zip.writeZip(pick.filePath);
      return { ok: true, savedPath: pick.filePath };
    }
  );
}
