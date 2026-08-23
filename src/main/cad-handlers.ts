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
import { assertStlBase64Size, assertTextContentSize, IPC_CONTENT_LIMITS } from "./path-security";
import { findForbiddenSecretField } from "../shared/secrets-metadata";
import {
  NETWORK_GUARD_DEFAULTS,
  STL_CONTENT_TYPES,
  safeFetch,
  sanitizeNetworkError,
  validateCadApiUrl,
  validateCadApiUrlSync,
} from "./network-guard";
import {
  assertCadJobOwnedBySender,
  ensureCadOperationBound,
  registerCadJobOwner,
  shouldIssueCadCancelOnce,
} from "./operation-registry";
import {
  acquireCadWorkspaceLock,
  bindCadLockJobId,
  getCadWorkspaceLock,
  heartbeatCadWorkspaceLock,
  markCadLockCancelling,
  releaseCadWorkspaceLock,
  scanCadLockOrphans,
} from "./cad-workspace-lock";
import type { BoundWorkspaceRootGetter } from "./bound-workspace";
import { mapCadHealthSnapshot } from "../shared/cad-health-contract";
import {
  mapCadHttpFailure,
  mapCadTransportError,
} from "../shared/cad-transport-error";

let resolvedBaseUrl: string | null = null;

/** Clear cached URL so the next request re-resolves. */
export function resetCadBaseUrlCache(): void {
  resolvedBaseUrl = null;
}

/** Ensures CAD_API_URL is a valid absolute URL (adds https:// if omitted). */
export function normalizeCadApiUrl(raw: string): string {
  const validated = validateCadApiUrlSync(raw);
  if (validated.ok) return validated.normalized;
  // Fallback for internal callers with already-trusted local URL during boot races.
  let url = raw.trim().replace(/\/+$/, "");
  if (!url) return url;
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url;
}

/** Apply SSRF checks before accepting a CAD API base URL into process.env. */
export async function acceptCadApiUrl(raw: string): Promise<
  { ok: true; normalized: string } | { ok: false; error: string }
> {
  const result = await validateCadApiUrl(raw);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, normalized: result.normalized };
}

async function probeHealth(baseUrl: string, timeoutMs = 1_200): Promise<boolean> {
  try {
    const result = await safeFetch(`${baseUrl.replace(/\/+$/, "")}/health`, {
      mode: "cad-base",
      cadBaseUrl: baseUrl,
      timeoutMs,
      maxBytes: NETWORK_GUARD_DEFAULTS.JSON_MAX_BYTES,
      allowedContentTypes: null,
    });
    return result.ok;
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
    const validated = validateCadApiUrlSync(explicit);
    if (validated.ok) {
      resolvedBaseUrl = validated.normalized;
      process.env.CAD_API_URL = validated.normalized;
      return resolvedBaseUrl;
    }
    console.warn("[cad] ignoring invalid CAD_API_URL:", validated.error);
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
  const base = await resolveCadBaseUrl();
  const url = `${base.replace(/\/+$/, "")}${pathSuffix}`;
  const authHeaders = cadAuthHeaders(cavalId);
  const extra =
    (fetchInit.headers as Record<string, string> | undefined) ?? undefined;
  const result = await safeFetch(url, {
    mode: "cad-base",
    cadBaseUrl: base,
    method: (fetchInit.method as string | undefined) ?? "GET",
    body: fetchInit.body as BodyInit | null | undefined,
    headers: extra,
    trustedCadOrigin: base,
    cadAuthHeaders: authHeaders,
    timeoutMs: NETWORK_GUARD_DEFAULTS.TIMEOUT_MS,
    maxBytes: NETWORK_GUARD_DEFAULTS.JSON_MAX_BYTES,
    allowedContentTypes: null,
  });
  const json = JSON.parse(result.buffer.toString("utf8")) as T;
  return { ok: result.ok, status: result.status, json };
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
    const result = await safeFetch(`${baseUrl.replace(/\/+$/, "")}/health`, {
      mode: "cad-base",
      cadBaseUrl: baseUrl,
      timeoutMs: 4_000,
      maxBytes: NETWORK_GUARD_DEFAULTS.JSON_MAX_BYTES,
      allowedContentTypes: null,
    });
    if (!result.ok) return false;
    const body = JSON.parse(result.buffer.toString("utf8")) as Record<string, unknown>;
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
  secured: Record<string, unknown>,
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

const mapFetchError = (error: unknown): { ok: false; error: string } =>
  mapCadTransportError(error, { cloudOnly: isCadCloudOnly() });

/** Shared by IPC cancel + unified cancelOperation (once per jobId). */
export async function cancelCadJobRemote(
  jobId: string,
  cavalId?: string
): Promise<{ ok: boolean; jobId?: string; status?: string; error?: string; remoteCancel: "ok" | "failed" | "skipped" }> {
  if (!jobId) {
    return { ok: false, error: "jobId is required", remoteCancel: "skipped" };
  }
  if (!shouldIssueCadCancelOnce(jobId)) {
    return { ok: true, jobId, status: "cancelled", remoteCancel: "skipped" };
  }
  try {
    const { ok, status, json } = await cadFetchJson<CadJobResponse>(
      `/cad/jobs/${encodeURIComponent(jobId)}`,
      {
        method: "DELETE",
        cavalId: resolveCavalId(cavalId),
      }
    );
    if (!ok) {
      return {
        ok: false,
        jobId,
        error: mapCadHttpFailure(status, "cancel"),
        remoteCancel: "failed",
      };
    }
    return {
      ok: true,
      jobId,
      status: (json as { status?: string }).status ?? "cancelled",
      remoteCancel: "ok",
    };
  } catch (error) {
    const mapped = mapFetchError(error);
    return { ok: false, jobId, error: mapped.error, remoteCancel: "failed" };
  }
}

export const registerCadHandlers = (
  getBoundWorkspaceRoot: BoundWorkspaceRootGetter = () => undefined
): void => {
  const handle = (
    channel: string,
    listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
  ) => {
    ipcMain.handle(channel, (event, ...args) => {
      assertTrustedSender(event);
      return listener(event, ...args);
    });
  };

  const resolveWorkspaceForCad = (
    event: IpcMainInvokeEvent,
    inputWorkspace?: unknown
  ): string => {
    const fromInput =
      typeof inputWorkspace === "string" ? inputWorkspace.trim() : "";
    const bound = getBoundWorkspaceRoot(event.sender.id)?.trim() || "";
    return fromInput || bound;
  };

  // Periodic orphan scan — heartbeat-based; does not kill healthy long jobs.
  const orphanTimer = setInterval(() => {
    const orphans = scanCadLockOrphans();
    for (const lock of orphans) {
      console.warn("[cad-lock] orphan candidate", {
        operationId: lock.operationId,
        jobId: lock.jobId,
        workspaceRoot: lock.workspaceRoot,
        lastHeartbeatAt: lock.lastHeartbeatAt,
      });
      if (lock.jobId) {
        void cancelCadJobRemote(lock.jobId).finally(() => {
          releaseCadWorkspaceLock({
            operationId: lock.operationId,
            jobId: lock.jobId ?? undefined,
            reason: "orphaned",
          });
        });
      } else {
        releaseCadWorkspaceLock({
          operationId: lock.operationId,
          reason: "orphaned",
        });
      }
    }
  }, 60_000);
  orphanTimer.unref?.();

  handle("cad:isCloudOnly", () => ({
    cloudOnly: isCadCloudOnly(),
  }));

  /** Keys stay in main env — never accept secret fields from the renderer. */
  const attachMainCadSecrets = <T extends Record<string, unknown>>(input: T): T & {
    openRouterApiKey?: string;
    meshApiKey?: string;
    piapiApiKey?: string;
  } => {
    const {
      openRouterApiKey: _a,
      meshApiKey: _b,
      piapiApiKey: _c,
      ...rest
    } = input as T & {
      openRouterApiKey?: string;
      meshApiKey?: string;
      piapiApiKey?: string;
    };
    void _a;
    void _b;
    void _c;
    return {
      ...(rest as T),
      openRouterApiKey: process.env.OPENROUTER_API_KEY?.trim() || undefined,
      meshApiKey: process.env.MESHY_API_KEY?.trim() || undefined,
      piapiApiKey:
        process.env.PIAPI_API_KEY?.trim() ||
        process.env.TRELLIS_API_KEY?.trim() ||
        undefined,
    };
  };

  const rejectRendererSecrets = (input: unknown): { ok: false; error: string } | null => {
    const forbidden = findForbiddenSecretField(input);
    if (!forbidden) return null;
    return {
      ok: false,
      error: `Renderer must not supply ${forbidden}; CAD secrets stay in main process env.`,
    };
  };

  handle("cad:createJob", async (event, input: unknown) => {
    const rejected = rejectRendererSecrets(input);
    if (rejected) return rejected satisfies CadJobResponse;
    const jobInput = input as CadCreateJobInput & { workspaceRoot?: string; operationId?: string };
    if (!jobInput?.prompt?.trim()) {
      return { ok: false, error: "prompt is required" } satisfies CadJobResponse;
    }

    const workspaceRoot = resolveWorkspaceForCad(event, jobInput.workspaceRoot);
    if (!workspaceRoot) {
      return {
        ok: false,
        error: "No workspace open. Open a folder before creating a CAD job.",
      };
    }

    const acquired = acquireCadWorkspaceLock({
      workspaceRoot,
      senderId: event.sender.id,
      operationId: jobInput.operationId,
    });
    if (!acquired.ok) {
      if (acquired.code === "cad_job_in_progress") {
        return {
          ok: false,
          code: "cad_job_in_progress" as const,
          jobId: acquired.jobId ?? undefined,
          operationId: acquired.operationId,
          phase: acquired.phase,
          ownerIsCaller: acquired.ownerIsCaller,
          error: acquired.message,
        };
      }
      return { ok: false, error: acquired.error };
    }

    const operationId = acquired.lock.operationId;
    const releaseFailed = (reason: "failed" | "aborted" = "failed") => {
      releaseCadWorkspaceLock({
        operationId,
        workspaceRoot,
        reason,
      });
    };

    try {
      const cavalId = resolveCavalId(jobInput.cavalId);
      let secured = attachMainCadSecrets({ ...jobInput, cavalId } as Record<string, unknown>);
      const mode = await ensurePiapiCompatibleCad(Boolean(secured.piapiApiKey));
      if (mode === "cloud-legacy") {
        secured = omitPiapiKey(secured);
      }

      // Single create attempt path: at most one successful POST (cloud OR local), never both.
      let { ok, status, json } = await postCadJob(secured, cavalId);
      let postedOk = ok;

      if (
        !postedOk &&
        (isCloudInternalCadError(json.error, status) || isCadSchemaCompatError(json.error)) &&
        !process.env.CAD_USE_LOCAL
      ) {
        const localReady = await tryLocalCadFallback();
        if (localReady) {
          secured = attachMainCadSecrets({ ...jobInput, cavalId } as Record<string, unknown>);
          ({ ok, status, json } = await postCadJob(secured, cavalId));
          postedOk = ok;
        } else if (isCadSchemaCompatError(json.error)) {
          secured = omitPiapiKey(attachMainCadSecrets({ ...jobInput, cavalId } as Record<string, unknown>));
          ({ ok, status, json } = await postCadJob(secured, cavalId));
          postedOk = ok;
        }
      }

      if (!postedOk) {
        releaseFailed("failed");
        return {
          ok: false,
          error: mapCadHttpFailure(status, "job"),
          operationId,
        };
      }

      const jobId = (json as { jobId?: string }).jobId;
      if (!jobId) {
        releaseFailed("failed");
        return {
          ok: false,
          error: "CAD API returned no jobId",
          operationId,
        };
      }

      bindCadLockJobId(operationId, jobId);
      registerCadJobOwner(jobId, event.sender.id, workspaceRoot);
      ensureCadOperationBound({
        operationId,
        jobId,
        senderId: event.sender.id,
        workspaceRoot,
      });
      heartbeatCadWorkspaceLock({ operationId, jobId, workspaceRoot });

      return {
        ...json,
        ok: true,
        jobId,
        operationId,
      };
    } catch (error) {
      if (!process.env.CAD_USE_LOCAL) {
        try {
          const localReady = await tryLocalCadFallback();
          if (localReady) {
            const cavalId = resolveCavalId((input as CadCreateJobInput).cavalId);
            const secured = attachMainCadSecrets({
              ...(input as CadCreateJobInput),
              cavalId,
            } as Record<string, unknown>);
            const retry = await postCadJob(secured, cavalId);
            if (retry.ok) {
              const jobId = (retry.json as { jobId?: string }).jobId;
              if (jobId) {
                bindCadLockJobId(operationId, jobId);
                registerCadJobOwner(jobId, event.sender.id, workspaceRoot);
                ensureCadOperationBound({
                  operationId,
                  jobId,
                  senderId: event.sender.id,
                  workspaceRoot,
                });
                return { ...retry.json, ok: true, jobId, operationId };
              }
            }
            releaseFailed("failed");
            return {
              ok: false,
              error: mapCadHttpFailure(retry.status, "job"),
              operationId,
            };
          }
        } catch {
          /* fall through */
        }
      }
      releaseFailed("failed");
      return { ...mapFetchError(error), operationId };
    }
  });

  handle(
    "cad:getJob",
    async (event, input: unknown) => {
      const payload = input as string | { jobId: string; cavalId?: string; workspaceRoot?: string };
      const jobId = typeof payload === "string" ? payload : payload?.jobId;
      const cavalId = typeof payload === "string" ? undefined : payload?.cavalId;
      const workspaceRoot =
        typeof payload === "string"
          ? resolveWorkspaceForCad(event, undefined)
          : resolveWorkspaceForCad(event, payload?.workspaceRoot);
      if (!jobId) return { ok: false, error: "jobId is required" } satisfies CadJobResponse;
      try {
        heartbeatCadWorkspaceLock({ jobId, workspaceRoot });
        const { ok, status, json } = await cadFetchJson<CadJobResponse>(
          `/cad/jobs/${encodeURIComponent(jobId)}`,
          { method: "GET", cavalId: resolveCavalId(cavalId) }
        );
        if (!ok) {
          return { ok: false, error: mapCadHttpFailure(status, "job") };
        }
        const remoteStatus = String((json as { status?: string }).status ?? "");
        if (remoteStatus === "done") {
          releaseCadWorkspaceLock({ jobId, workspaceRoot, reason: "completed" });
        } else if (remoteStatus === "failed") {
          releaseCadWorkspaceLock({ jobId, workspaceRoot, reason: "failed" });
        } else if (remoteStatus === "cancelled") {
          releaseCadWorkspaceLock({ jobId, workspaceRoot, reason: "aborted" });
        }
        return json;
      } catch (error) {
        return mapFetchError(error);
      }
    }
  );

  handle(
    "cad:cancelJob",
    async (event, input: unknown) => {
      const payload = input as { jobId: string; cavalId?: string; workspaceRoot?: string };
      if (!payload?.jobId) return { ok: false, error: "jobId is required" };
      const workspaceRoot = resolveWorkspaceForCad(event, payload.workspaceRoot);
      const owned = assertCadJobOwnedBySender(event.sender.id, payload.jobId, workspaceRoot);
      if (!owned.ok) {
        return { ok: false, error: owned.error };
      }
      markCadLockCancelling({
        jobId: payload.jobId,
        workspaceRoot,
        senderId: event.sender.id,
      });
      const remote = await cancelCadJobRemote(payload.jobId, payload.cavalId);
      if (remote.remoteCancel === "ok" || remote.remoteCancel === "skipped") {
        releaseCadWorkspaceLock({
          jobId: payload.jobId,
          workspaceRoot,
          reason: "aborted",
        });
      }
      return remote;
    }
  );

  handle(
    "cad:cancelJobs",
    async (event, input: unknown) => {
      const payload = input as {
        jobIds: string[];
        cavalId?: string;
        workspaceRoot?: string;
      };
      const jobIds = Array.isArray(payload?.jobIds)
        ? payload.jobIds.map((id) => String(id)).filter(Boolean)
        : [];
      if (!jobIds.length) {
        return { ok: false, error: "jobIds required", results: [] as const };
      }
      const workspaceRoot = resolveWorkspaceForCad(event, payload.workspaceRoot);
      const lock = workspaceRoot ? getCadWorkspaceLock(workspaceRoot) : undefined;
      // cancelJobs = cancel parts (owner). BLOCK policy applies to destructive
      // batch *delete/clear* in the renderer, not to owner cancel of part jobs.
      const results: Array<{
        jobId: string;
        ok: boolean;
        remoteCancel?: string;
        error?: string;
      }> = [];
      const concurrency = 3;
      for (let i = 0; i < jobIds.length; i += concurrency) {
        const slice = jobIds.slice(i, i + concurrency);
        const chunk = await Promise.all(
          slice.map(async (jobId) => {
            const owned = assertCadJobOwnedBySender(event.sender.id, jobId, workspaceRoot);
            if (!owned.ok) {
              return { jobId, ok: false, error: owned.error, remoteCancel: "failed" as const };
            }
            const remote = await cancelCadJobRemote(jobId, payload.cavalId);
            return {
              jobId,
              ok: remote.ok,
              remoteCancel: remote.remoteCancel,
              error: remote.error,
            };
          })
        );
        results.push(...chunk);
      }
      const anyFail = results.some((r) => !r.ok || r.remoteCancel === "failed");
      const anyOk = results.some((r) => r.ok && r.remoteCancel !== "failed");
      if (lock && lock.senderId === event.sender.id) {
        releaseCadWorkspaceLock({
          operationId: lock.operationId,
          workspaceRoot,
          reason: "aborted",
        });
      }
      return {
        ok: !anyFail,
        partiallyCancelled: anyFail && anyOk,
        results,
      };
    }
  );

  handle(
    "cad:heartbeat",
    async (event, input: unknown) => {
      const payload = input as {
        jobId?: string;
        operationId?: string;
        workspaceRoot?: string;
      };
      const workspaceRoot = resolveWorkspaceForCad(event, payload?.workspaceRoot);
      const ok = heartbeatCadWorkspaceLock({
        jobId: payload?.jobId,
        operationId: payload?.operationId,
        workspaceRoot,
      });
      return { ok };
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
          return { ok: false, error: mapCadHttpFailure(status, "logs") };
        }
        return json;
      } catch (error) {
        return mapFetchError(error);
      }
    }
  );

  handle("cad:plan", async (_event, input: unknown) => {
    const rejected = rejectRendererSecrets(input);
    if (rejected) return rejected;
    const bodyInput = input as CadPlanInput;
    if (!bodyInput?.latestUserText?.trim()) {
      return { ok: false, error: "latestUserText is required" };
    }
    try {
      let body = attachMainCadSecrets(bodyInput as unknown as Record<string, unknown>);
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
          body = attachMainCadSecrets(bodyInput as unknown as Record<string, unknown>);
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
          body = omitPiapiKey(attachMainCadSecrets(bodyInput as unknown as Record<string, unknown>));
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
        return {
          ok: false,
          error: mapCadHttpFailure(status, "plan"),
        };
      }
      return json;
    } catch (error) {
      return mapFetchError(error);
    }
  });

  handle("cad:health", async () => {
    try {
      const base = await resolveCadBaseUrl();
      const reachable = await probeHealth(base, 5_000);
      if (!reachable) {
        return mapCadHealthSnapshot({ reachable: false });
      }
      const result = await safeFetch(`${base.replace(/\/+$/, "")}/health`, {
        mode: "cad-base",
        cadBaseUrl: base,
        timeoutMs: 5_000,
        maxBytes: NETWORK_GUARD_DEFAULTS.JSON_MAX_BYTES,
        allowedContentTypes: null,
      });
      if (!result.ok) {
        return mapCadHealthSnapshot({ reachable: false });
      }
      let body: unknown;
      try {
        body = JSON.parse(result.buffer.toString("utf8"));
      } catch {
        return mapCadHealthSnapshot({ reachable: false });
      }
      return mapCadHealthSnapshot({ reachable: true, body });
    } catch {
      return mapCadHealthSnapshot({ reachable: false });
    }
  });

  handle(
    "cad:downloadStl",
    async (event, input: unknown) => {
      const payload = input as { url: string; defaultName?: string; cavalId?: string };
      if (!payload?.url) return { ok: false, error: "url is required" };
      try {
        const cadBase = await resolveCadBaseUrl();
        // Auth headers ONLY when URL origin matches CAD base — never for free renderer URLs.
        const result = await safeFetch(payload.url, {
          mode: "cad-artifact",
          cadBaseUrl: cadBase,
          trustedCadOrigin: cadBase,
          cadAuthHeaders: cadAuthHeaders(resolveCavalId(payload.cavalId)),
          timeoutMs: NETWORK_GUARD_DEFAULTS.TIMEOUT_MS,
          maxBytes: NETWORK_GUARD_DEFAULTS.STL_MAX_BYTES,
          allowedContentTypes: STL_CONTENT_TYPES,
        });
        if (!result.ok) return { ok: false, error: `Download failed (${result.status})` };
        const buffer = result.buffer;
        // Outside workspace write ONLY via native Save dialog (renderer never supplies free path).
        if (buffer.length > IPC_CONTENT_LIMITS.STL_BYTES) {
          return {
            ok: false,
            error: `STL buffer exceeds limit (${buffer.length} > ${IPC_CONTENT_LIMITS.STL_BYTES} bytes)`,
          };
        }
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
        return { ok: false, error: sanitizeNetworkError(error) };
      }
    }
  );

  handle(
    "cad:saveStlBase64",
    async (event, input: unknown) => {
      const payload = input as { base64: string; defaultName?: string };
      if (!payload?.base64?.trim()) return { ok: false, error: "base64 is required" };
      try {
        // Outside workspace write ONLY via native Save dialog (renderer never supplies free path).
        const buffer = assertStlBase64Size(payload.base64);
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
        const cadBase = await resolveCadBaseUrl();
        // Auth headers ONLY when URL origin matches CAD base — never for free renderer/LLM URLs.
        const result = await safeFetch(payload.url, {
          mode: "cad-artifact",
          cadBaseUrl: cadBase,
          trustedCadOrigin: cadBase,
          headers: { accept: "model/stl,*/*" },
          cadAuthHeaders: cadAuthHeaders(resolveCavalId(payload.cavalId)),
          timeoutMs: NETWORK_GUARD_DEFAULTS.TIMEOUT_MS,
          maxBytes: NETWORK_GUARD_DEFAULTS.STL_MAX_BYTES,
          allowedContentTypes: STL_CONTENT_TYPES,
        });
        if (!result.ok) {
          return { ok: false, error: `STL fetch failed (${result.status})` };
        }
        const buffer = result.buffer;
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
        return { ok: false, error: sanitizeNetworkError(error) };
      }
    }
  );

  handle(
    "cad:downloadScad",
    async (event, input: unknown) => {
      const payload = input as { content: string; defaultName?: string };
      if (!payload?.content?.trim()) return { ok: false, error: "content is required" };
      try {
        // Outside workspace write ONLY via native Save dialog (renderer never supplies free path).
        assertTextContentSize(payload.content, "SCAD content");
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
