import { dialog, ipcMain, BrowserWindow, type IpcMainInvokeEvent } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import {
  applyCadCloudEnvDefaults,
  DEFAULT_CAD_CLOUD_URL,
  isCadCloudOnly,
} from "./cad-config";
import { ensureCadLocalServer, localCadUrl } from "./cad-local-server";
import { tryInstallOpenScad } from "../../engineering/cad-server/openscad-install";
import { assertTrustedSender } from "./ipc-trust";

let resolvedBaseUrl: string | null = null;

/** Clear cached URL so the next request re-resolves. */
export function resetCadBaseUrlCache(): void {
  resolvedBaseUrl = null;
}

/** Ensures CAD_API_URL is a valid absolute URL (adds https:// if omitted). */
export function normalizeCadApiUrl(raw: string): string {
  let url = raw.trim().replace(/\/+$/, "");
  if (!url) return url;
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url;
}

async function probeHealth(baseUrl: string, timeoutMs = 1_200): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/health`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

/** Cloud-only (default Electron) or explicit CAD_API_URL; local only when CAD_CLOUD_ONLY=0. */
export async function resolveCadBaseUrl(): Promise<string> {
  applyCadCloudEnvDefaults();

  if (resolvedBaseUrl && (await probeHealth(resolvedBaseUrl, 1_500))) {
    return resolvedBaseUrl;
  }

  const explicit = process.env.CAD_API_URL?.trim();
  if (explicit) {
    resolvedBaseUrl = normalizeCadApiUrl(explicit);
    return resolvedBaseUrl;
  }

  if (isCadCloudOnly()) {
    resolvedBaseUrl = normalizeCadApiUrl(DEFAULT_CAD_CLOUD_URL);
    return resolvedBaseUrl;
  }

  const local = localCadUrl();
  await ensureCadLocalServer();

  for (let attempt = 0; attempt < 3; attempt++) {
    if (await probeHealth(local, 2_500)) {
      resolvedBaseUrl = local;
      process.env.CAD_API_URL = local;
      process.env.CAD_USE_LOCAL = "1";
      return local;
    }
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 800));
      await ensureCadLocalServer();
    }
  }

  resolvedBaseUrl = local;
  return local;
}

const cadFetchHint = (base: string): string =>
  isCadCloudOnly()
    ? `Server CAD cloud (${base}). Verifică URL-ul în Setări → CAD Cloud.`
    : `CAD API (${base}). Setează cad.apiUrl sau rulează: npm run cad:serve`;

const cadAuthHeaders = (cavalId?: string): Record<string, string> => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const apiKey = process.env.CAD_API_KEY?.trim();
  if (apiKey) headers["x-cad-api-key"] = apiKey;
  if (cavalId?.trim()) headers["x-caval-user-id"] = cavalId.trim();
  return headers;
};

const resolveCavalId = (inputCavalId?: string): string => inputCavalId?.trim() || "anonymous";

const cadFetchJson = async <T>(
  pathSuffix: string,
  init: RequestInit & { cavalId?: string } = {}
): Promise<{ ok: boolean; status: number; json: T }> => {
  const { cavalId, ...fetchInit } = init;
  const headers = {
    ...cadAuthHeaders(cavalId),
    ...(fetchInit.headers as Record<string, string> | undefined),
  };
  const base = await resolveCadBaseUrl();
  const res = await fetch(`${base}${pathSuffix}`, { ...fetchInit, headers });
  const json = (await res.json()) as T;
  return { ok: res.ok, status: res.status, json };
};

export interface CadCreateJobInput {
  prompt: string;
  projectType?: string;
  constraints?: Record<string, string | undefined>;
  cavalId?: string;
  planContext?: {
    requirements?: string;
    assembly?: string;
    components?: string;
    performance?: string;
  };
  openRouterApiKey?: string;
  meshApiKey?: string;
  piapiApiKey?: string;
  quality?: "standard" | "high";
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  previousScad?: string;
  generationMode?: "openscad" | "mesh" | "library";
  meshPrompt?: string;
  previousMeshTaskId?: string;
  attachments?: Array<{ path: string; name: string; content: string }>;
}

export interface CadPlanInput {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  latestUserText: string;
  openRouterApiKey?: string;
  meshApiKey?: string;
  piapiApiKey?: string;
  previousMeshTaskId?: string;
  cavalId?: string;
}

export interface CadPlanResult {
  action: "clarify" | "generate";
  userLanguage: "ro" | "en";
  intent: "mechanical" | "organic" | "figurine" | "mixed";
  pipeline: "openscad" | "mesh";
  questions?: string[];
  assistantMessage?: string;
  technicalPrompt: string;
  suggestedDimensions?: string;
  warnings?: string[];
  quickReplies?: string[];
}

export interface CadJobResponse {
  ok: boolean;
  jobId?: string;
  status?: string;
  stlUrl?: string | null;
  scad?: string | null;
  error?: string | null;
  dimensions?: { x: number; y: number; z: number } | null;
  meshTaskId?: string | null;
  logs?: Array<{ at: string; level: string; event: string; message?: string }>;
}

const isCloudInternalCadError = (error: string | null | undefined, status?: number): boolean => {
  if (status === 500 || status === 502 || status === 503) return true;
  if (!error?.trim()) return false;
  return /Internal server error|internal_error|Failed to create CAD job/i.test(error);
};

/** Old Railway CAD rejects newer body fields (e.g. piapiApiKey) via Zod .strict(). */
const isCadSchemaCompatError = (error: string | null | undefined): boolean =>
  /Unrecognized key/i.test(error ?? "");

/** True when remote /health advertises PiAPI support (field present). */
async function cadServerSupportsPiapiField(baseUrl: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4_000);
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return false;
    const body = (await res.json()) as Record<string, unknown>;
    return Object.prototype.hasOwnProperty.call(body, "piapiConfigured");
  } catch {
    return false;
  }
}

const omitPiapiKey = <T extends { piapiApiKey?: string }>(input: T): T => {
  if (!input.piapiApiKey) return input;
  const { piapiApiKey: _drop, ...rest } = input;
  return rest as T;
};

const postCadJob = async (
  secured: CadCreateJobInput,
  cavalId: string
): Promise<{ ok: boolean; status: number; json: CadJobResponse }> =>
  cadFetchJson<CadJobResponse>("/cad/jobs", {
    method: "POST",
    cavalId,
    body: JSON.stringify(secured),
  });

const tryLocalCadFallback = async (): Promise<boolean> => {
  const started = await ensureCadLocalServer();
  if (!started) return false;
  resetCadBaseUrlCache();
  process.env.CAD_API_URL = localCadUrl();
  process.env.CAD_USE_LOCAL = "1";
  process.env.CAD_CLOUD_ONLY = "0";
  console.warn("[cad] switched to local CAD at", localCadUrl());
  return true;
};

/** Prefer local CAD when cloud is too old for PiAPI Trellis keys. */
const ensurePiapiCompatibleCad = async (hasPiapiKey: boolean): Promise<"local" | "cloud-legacy" | "cloud"> => {
  if (!hasPiapiKey || process.env.CAD_USE_LOCAL === "1") {
    return process.env.CAD_USE_LOCAL === "1" ? "local" : "cloud";
  }
  const base = await resolveCadBaseUrl();
  if (base.includes("127.0.0.1") || base.includes("localhost")) return "local";
  if (await cadServerSupportsPiapiField(base)) return "cloud";
  if (await tryLocalCadFallback()) return "local";
  return "cloud-legacy";
};

const mapFetchError = async (error: unknown): Promise<{ ok: false; error: string }> => {
  const message = error instanceof Error ? error.message : String(error);
  const base = await resolveCadBaseUrl();
  const hint =
    message === "fetch failed"
      ? `${message} — nu pot accesa ${cadFetchHint(base)}`
      : message;
  return { ok: false, error: hint };
};

export const registerCadHandlers = (): void => {
  const handle = (
    channel: string,
    listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
  ) => {
    ipcMain.handle(channel, (event, ...args) => {
      assertTrustedSender(event);
      return listener(event, ...args);
    });
  };

  handle("cad:isCloudOnly", () => ({
    ok: true,
    cloudOnly: isCadCloudOnly(),
    defaultUrl: DEFAULT_CAD_CLOUD_URL,
  }));

  /** Keys stay in main env — ignore any values the renderer may still send. */
  const attachMainCadSecrets = <
    T extends { openRouterApiKey?: string; meshApiKey?: string; piapiApiKey?: string }
  >(
    input: T
  ): T => ({
    ...input,
    openRouterApiKey: process.env.OPENROUTER_API_KEY?.trim() || undefined,
    meshApiKey: process.env.MESHY_API_KEY?.trim() || undefined,
    piapiApiKey:
      process.env.PIAPI_API_KEY?.trim() ||
      process.env.TRELLIS_API_KEY?.trim() ||
      undefined,
  });

  handle("cad:plan", async (_event, input: unknown) => {
    const bodyInput = input as CadPlanInput;
    if (!bodyInput?.latestUserText?.trim()) {
      return { ok: false, error: "latestUserText is required" };
    }
    try {
      let body = attachMainCadSecrets(bodyInput);
      const mode = await ensurePiapiCompatibleCad(Boolean(body.piapiApiKey));
      if (mode === "cloud-legacy") {
        body = omitPiapiKey(body);
      }

      let { ok, status, json } = await cadFetchJson<{ ok: boolean; plan?: CadPlanResult; error?: string }>(
        "/cad/plan",
        {
          method: "POST",
          cavalId: resolveCavalId(bodyInput.cavalId),
          body: JSON.stringify(body),
        }
      );

      if (
        !ok &&
        isCadSchemaCompatError(json.error) &&
        !process.env.CAD_USE_LOCAL
      ) {
        const localReady = await tryLocalCadFallback();
        if (localReady) {
          body = attachMainCadSecrets(bodyInput);
          ({ ok, status, json } = await cadFetchJson<{
            ok: boolean;
            plan?: CadPlanResult;
            error?: string;
          }>("/cad/plan", {
            method: "POST",
            cavalId: resolveCavalId(bodyInput.cavalId),
            body: JSON.stringify(body),
          }));
        } else {
          body = omitPiapiKey(attachMainCadSecrets(bodyInput));
          ({ ok, status, json } = await cadFetchJson<{
            ok: boolean;
            plan?: CadPlanResult;
            error?: string;
          }>("/cad/plan", {
            method: "POST",
            cavalId: resolveCavalId(bodyInput.cavalId),
            body: JSON.stringify(body),
          }));
        }
      }

      if (!ok) {
        return { ok: false, error: json.error ?? `CAD plan error (${status})` };
      }
      return json;
    } catch (error) {
      return await mapFetchError(error);
    }
  });

  handle("cad:health", async () => {
    try {
      const base = await resolveCadBaseUrl();
      const ok = await probeHealth(base, 5_000);
      if (!ok) {
        return {
          ok: false,
          url: base,
          cloudOnly: isCadCloudOnly(),
          error: "Server CAD cloud offline — verifică URL în Setări → CAD Cloud.",
        };
      }
      const res = await fetch(`${base.replace(/\/+$/, "")}/health`);
      const body = (await res.json()) as Record<string, unknown>;
      return { ok: true, url: base, cloudOnly: isCadCloudOnly(), ...body };
    } catch (error) {
      return {
        ok: false,
        url: await resolveCadBaseUrl(),
        cloudOnly: isCadCloudOnly(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  handle("cad:createJob", async (_event, input: unknown) => {
    const jobInput = input as CadCreateJobInput;
    if (!jobInput?.prompt?.trim()) {
      return { ok: false, error: "prompt is required" } satisfies CadJobResponse;
    }
    try {
      const cavalId = resolveCavalId(jobInput.cavalId);
      let secured = attachMainCadSecrets({ ...jobInput, cavalId });
      const mode = await ensurePiapiCompatibleCad(Boolean(secured.piapiApiKey));
      if (mode === "cloud-legacy") {
        secured = omitPiapiKey(secured);
      }

      let { ok, status, json } = await postCadJob(secured, cavalId);

      if (
        !ok &&
        (isCloudInternalCadError(json.error, status) || isCadSchemaCompatError(json.error)) &&
        !process.env.CAD_USE_LOCAL
      ) {
        const localReady = await tryLocalCadFallback();
        if (localReady) {
          secured = attachMainCadSecrets({ ...jobInput, cavalId });
          ({ ok, status, json } = await postCadJob(secured, cavalId));
        } else if (isCadSchemaCompatError(json.error)) {
          secured = omitPiapiKey(attachMainCadSecrets({ ...jobInput, cavalId }));
          ({ ok, status, json } = await postCadJob(secured, cavalId));
        }
      }

      if (!ok) {
        return { ok: false, error: json.error ?? `CAD API error (${status})` };
      }
      return json;
    } catch (error) {
      if (!process.env.CAD_USE_LOCAL) {
        try {
          const localReady = await tryLocalCadFallback();
          if (localReady) {
            const cavalId = resolveCavalId((input as CadCreateJobInput).cavalId);
            const secured = attachMainCadSecrets({
              ...(input as CadCreateJobInput),
              cavalId,
            });
            const retry = await postCadJob(secured, cavalId);
            if (retry.ok) return retry.json;
            return {
              ok: false,
              error: retry.json.error ?? `CAD API error (${retry.status})`,
            };
          }
        } catch {
          /* fall through */
        }
      }
      return await mapFetchError(error);
    }
  });

  handle(
    "cad:getJob",
    async (_event, input: unknown) => {
      const payload = input as string | { jobId: string; cavalId?: string };
      const jobId = typeof payload === "string" ? payload : payload?.jobId;
      const cavalId = typeof payload === "string" ? undefined : payload?.cavalId;
      if (!jobId) return { ok: false, error: "jobId is required" } satisfies CadJobResponse;
      try {
        const { ok, status, json } = await cadFetchJson<CadJobResponse>(
          `/cad/jobs/${encodeURIComponent(jobId)}`,
          { method: "GET", cavalId: resolveCavalId(cavalId) }
        );
        if (!ok) {
          return { ok: false, error: json.error ?? `CAD API error (${status})` };
        }
        return json;
      } catch (error) {
        return await mapFetchError(error);
      }
    }
  );

  handle(
    "cad:cancelJob",
    async (_event, input: unknown) => {
      const payload = input as { jobId: string; cavalId?: string };
      if (!payload?.jobId) return { ok: false, error: "jobId is required" };
      try {
        const { ok, status, json } = await cadFetchJson<CadJobResponse>(
          `/cad/jobs/${encodeURIComponent(payload.jobId)}`,
          {
            method: "DELETE",
            cavalId: resolveCavalId(payload.cavalId),
          }
        );
        if (!ok) {
          return { ok: false, error: json.error ?? `CAD cancel error (${status})` };
        }
        return json;
      } catch (error) {
        return await mapFetchError(error);
      }
    }
  );

  handle(
    "cad:getJobLogs",
    async (_event, input: unknown) => {
      const payload = input as { jobId: string; cavalId?: string };
      if (!payload?.jobId) return { ok: false, error: "jobId is required" };
      try {
        const { ok, status, json } = await cadFetchJson<CadJobResponse>(
          `/cad/jobs/${encodeURIComponent(payload.jobId)}/logs`,
          { method: "GET", cavalId: resolveCavalId(payload.cavalId) }
        );
        if (!ok) {
          return { ok: false, error: json.error ?? `CAD logs error (${status})` };
        }
        return json;
      } catch (error) {
        return await mapFetchError(error);
      }
    }
  );

  handle(
    "cad:downloadStl",
    async (event, input: unknown) => {
      const payload = input as { url: string; defaultName?: string; cavalId?: string };
      if (!payload?.url) return { ok: false, error: "url is required" };
      try {
        const res = await fetch(payload.url, {
          headers: cadAuthHeaders(resolveCavalId(payload.cavalId)),
        });
        if (!res.ok) return { ok: false, error: `Download failed (${res.status})` };
        const buffer = Buffer.from(await res.arrayBuffer());
        const window = BrowserWindow.fromWebContents(event.sender) ?? undefined;
        const saveResult = window
          ? await dialog.showSaveDialog(window, {
              defaultPath: payload.defaultName ?? "model.stl",
              filters: [{ name: "STL", extensions: ["stl"] }],
            })
          : await dialog.showSaveDialog({
              defaultPath: payload.defaultName ?? "model.stl",
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

  handle(
    "cad:saveStlBase64",
    async (event, input: unknown) => {
      const payload = input as { base64: string; defaultName?: string };
      if (!payload?.base64?.trim()) return { ok: false, error: "base64 is required" };
      try {
        const buffer = Buffer.from(payload.base64, "base64");
        if (buffer.length < 84) {
          return { ok: false, error: "STL buffer too small" };
        }
        const window = BrowserWindow.fromWebContents(event.sender) ?? undefined;
        const saveResult = window
          ? await dialog.showSaveDialog(window, {
              defaultPath: payload.defaultName ?? "model-edited.stl",
              filters: [{ name: "STL", extensions: ["stl"] }],
            })
          : await dialog.showSaveDialog({
              defaultPath: payload.defaultName ?? "model-edited.stl",
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

  handle(
    "cad:fetchStl",
    async (_event, input: unknown) => {
      const payload = input as { url: string; cavalId?: string };
      if (!payload?.url?.trim()) return { ok: false, error: "url is required" };
      try {
        const headers = cadAuthHeaders(resolveCavalId(payload.cavalId));
        headers.accept = "model/stl,*/*";
        const res = await fetch(payload.url, { headers });
        if (!res.ok) {
          return { ok: false, error: `STL fetch failed (${res.status})` };
        }
        const buffer = Buffer.from(await res.arrayBuffer());
        // Guard: JSON error body mistaken for STL
        if (buffer.length >= 2 && buffer[0] === 0x7b /* { */) {
          return { ok: false, error: "STL endpoint returned JSON, not binary mesh" };
        }
        return {
          ok: true,
          base64: buffer.toString("base64"),
          bytes: buffer.length,
        };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
  );

  handle(
    "cad:downloadScad",
    async (event, input: unknown) => {
      const payload = input as { content: string; defaultName?: string };
      if (!payload?.content?.trim()) return { ok: false, error: "content is required" };
      try {
        const window = BrowserWindow.fromWebContents(event.sender) ?? undefined;
        const saveResult = window
          ? await dialog.showSaveDialog(window, {
              defaultPath: payload.defaultName ?? "model.scad",
              filters: [{ name: "OpenSCAD", extensions: ["scad"] }],
            })
          : await dialog.showSaveDialog({
              defaultPath: payload.defaultName ?? "model.scad",
              filters: [{ name: "OpenSCAD", extensions: ["scad"] }],
            });
        if (saveResult.canceled || !saveResult.filePath) {
          return { ok: false, canceled: true };
        }
        const target = saveResult.filePath.endsWith(".scad")
          ? saveResult.filePath
          : `${saveResult.filePath}.scad`;
        await fs.writeFile(target, payload.content, "utf8");
        return { ok: true, path: path.normalize(target) };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
  );

  handle("cad:installOpenScad", async () => {
    if (isCadCloudOnly()) {
      return {
        ok: false,
        installed: false,
        error: "OpenSCAD rulează pe serverul cloud — nu e nevoie de instalare locală.",
      };
    }
    try {
      const result = await tryInstallOpenScad();
      resetCadBaseUrlCache();
      return {
        ok: result.ok,
        installed: result.ok,
        error: result.error,
      };
    } catch (error) {
      return {
        ok: false,
        installed: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
};
