import { dialog, ipcMain, BrowserWindow } from "electron";
import fs from "node:fs/promises";
import path from "node:path";

const cadBaseUrl = (): string =>
  process.env.CAD_API_URL ?? `http://127.0.0.1:${process.env.CAD_PORT ?? 8791}`;

export interface CadCreateJobInput {
  prompt: string;
  projectType?: string;
  constraints?: Record<string, string | undefined>;
  cavalId?: string;
}

export interface CadJobResponse {
  ok: boolean;
  jobId?: string;
  status?: string;
  stlUrl?: string | null;
  scad?: string | null;
  error?: string | null;
}

export const registerCadHandlers = (): void => {
  ipcMain.handle("cad:createJob", async (_event, input: CadCreateJobInput) => {
    if (!input?.prompt?.trim()) {
      return { ok: false, error: "prompt is required" } satisfies CadJobResponse;
    }
    try {
      const res = await fetch(`${cadBaseUrl()}/cad/jobs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = (await res.json()) as CadJobResponse;
      if (!res.ok) {
        return { ok: false, error: json.error ?? `CAD API error (${res.status})` };
      }
      return json;
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("cad:getJob", async (_event, jobId: string) => {
    if (!jobId) return { ok: false, error: "jobId is required" } satisfies CadJobResponse;
    try {
      const res = await fetch(`${cadBaseUrl()}/cad/jobs/${encodeURIComponent(jobId)}`);
      const json = (await res.json()) as CadJobResponse;
      if (!res.ok) {
        return { ok: false, error: json.error ?? `CAD API error (${res.status})` };
      }
      return json;
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle(
    "cad:downloadStl",
    async (event, input: { url: string; defaultName?: string }) => {
      if (!input?.url) return { ok: false, error: "url is required" };
      try {
        const res = await fetch(input.url);
        if (!res.ok) return { ok: false, error: `Download failed (${res.status})` };
        const buffer = Buffer.from(await res.arrayBuffer());
        const window = BrowserWindow.fromWebContents(event.sender) ?? undefined;
        const saveResult = window
          ? await dialog.showSaveDialog(window, {
              defaultPath: input.defaultName ?? "model.stl",
              filters: [{ name: "STL", extensions: ["stl"] }],
            })
          : await dialog.showSaveDialog({
              defaultPath: input.defaultName ?? "model.stl",
              filters: [{ name: "STL", extensions: ["stl"] }],
            });
        if (saveResult.canceled || !saveResult.filePath) {
          return { ok: false, canceled: true };
        }
        const target = saveResult.filePath.endsWith(".stl")
          ? saveResult.filePath
          : `${saveResult.filePath}.stl`;
        await fs.writeFile(target, buffer);
        return { ok: true, path: path.normalize(target) };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
  );
};
