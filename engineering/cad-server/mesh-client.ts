import { convertGlbToStl } from "./glb-to-stl";

const MESHY_BASE = "https://api.meshy.ai/openapi/v2/text-to-3d";
const PIAPI_BASE = (process.env.PIAPI_BASE_URL?.trim() || "https://api.piapi.ai").replace(/\/+$/, "");
const POLL_INTERVAL_MS = Number(process.env.MESH_POLL_MS ?? 3000);
const POLL_MAX_MS = Number(process.env.MESH_POLL_MAX_MS ?? 300_000);
const WORKER_TIMEOUT_MS = Number(process.env.MESH_WORKER_TIMEOUT_MS ?? 600_000);

export interface GenerateMeshInput {
  prompt: string;
  meshApiKey?: string;
  /** PiAPI Trellis key (x-api-key). Also read from PIAPI_API_KEY / TRELLIS_API_KEY. */
  piapiApiKey?: string;
  previousMeshTaskId?: string;
  artStyle?: "realistic" | "sculpture";
}

export interface GenerateMeshResult {
  ok: boolean;
  stlBuffer?: Buffer;
  meshTaskId?: string;
  provider?: "piapi-trellis" | "trellis" | "meshy" | "mock" | string;
  error?: string;
}

export function resolveMeshApiKey(override?: string): string | undefined {
  return override?.trim() || process.env.MESHY_API_KEY?.trim() || undefined;
}

export function resolvePiapiApiKey(override?: string): string | undefined {
  return (
    override?.trim() ||
    process.env.PIAPI_API_KEY?.trim() ||
    process.env.TRELLIS_API_KEY?.trim() ||
    undefined
  );
}

export function resolveMeshWorkerUrl(): string | undefined {
  const raw = process.env.MESH_WORKER_URL?.trim();
  if (!raw) return undefined;
  return raw.replace(/\/+$/, "");
}

export function resolveMeshWorkerToken(): string | undefined {
  return process.env.MESH_WORKER_TOKEN?.trim() || undefined;
}

/** True when PiAPI Trellis, OSS worker, or Meshy can run pipeline=mesh. */
export function isMeshGenerationConfigured(
  meshApiKeyOverride?: string,
  piapiApiKeyOverride?: string
): boolean {
  return Boolean(
    resolvePiapiApiKey(piapiApiKeyOverride) ||
      resolveMeshWorkerUrl() ||
      resolveMeshApiKey(meshApiKeyOverride)
  );
}

type MeshyTask = {
  id?: string;
  status?: string;
  model_urls?: { stl?: string; glb?: string; obj?: string };
  task_error?: { message?: string };
};

async function createMeshyTask(
  apiKey: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; taskId?: string; error?: string }> {
  const response = await fetch(MESHY_BASE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    return { ok: false, error: `Meshy create failed (${response.status}): ${text.slice(0, 300)}` };
  }

  const json = (await response.json()) as { result?: string; message?: string };
  const taskId = json.result;
  if (!taskId) {
    return { ok: false, error: json.message ?? "Meshy did not return task id" };
  }
  return { ok: true, taskId };
}

async function pollMeshyTask(
  apiKey: string,
  taskId: string
): Promise<{ ok: boolean; task?: MeshyTask; error?: string }> {
  const started = Date.now();
  while (Date.now() - started < POLL_MAX_MS) {
    const response = await fetch(`${MESHY_BASE}/${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      const text = await response.text();
      return { ok: false, error: `Meshy poll failed (${response.status}): ${text.slice(0, 300)}` };
    }

    const task = (await response.json()) as MeshyTask;
    const status = task.status?.toUpperCase();

    if (status === "SUCCEEDED") {
      return { ok: true, task };
    }
    if (status === "FAILED" || status === "CANCELED") {
      return {
        ok: false,
        error: task.task_error?.message ?? `Mesh generation ${status?.toLowerCase() ?? "failed"}`,
      };
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  return { ok: false, error: "Mesh generation timed out (5 min)" };
}

async function downloadBytes(url: string): Promise<{ ok: boolean; buffer?: Buffer; error?: string }> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { ok: false, error: `Download failed (${response.status})` };
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 84) {
      return { ok: false, error: "Downloaded file is too small or invalid" };
    }
    return { ok: true, buffer };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function generateViaOssWorker(input: GenerateMeshInput): Promise<GenerateMeshResult> {
  const base = resolveMeshWorkerUrl();
  if (!base) {
    return { ok: false, error: "MESH_WORKER_URL not configured" };
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = resolveMeshWorkerToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WORKER_TIMEOUT_MS);
  try {
    const response = await fetch(`${base}/v1/text-to-3d`, {
      method: "POST",
      headers,
      body: JSON.stringify({ prompt: input.prompt.trim() }),
      signal: controller.signal,
    });
    const text = await response.text();
    let json: {
      ok?: boolean;
      stlBase64?: string;
      error?: string;
      provider?: string;
      detail?: string;
    } = {};
    try {
      json = JSON.parse(text) as typeof json;
    } catch {
      return {
        ok: false,
        error: `Mesh worker bad response (${response.status}): ${text.slice(0, 300)}`,
        provider: "trellis",
      };
    }

    if (!response.ok || !json.ok || !json.stlBase64) {
      return {
        ok: false,
        error: json.error || json.detail || `Mesh worker failed (${response.status})`,
        provider: json.provider ?? "trellis",
      };
    }

    const buffer = Buffer.from(json.stlBase64, "base64");
    if (buffer.length < 84) {
      return { ok: false, error: "Mesh worker returned invalid STL", provider: json.provider ?? "trellis" };
    }
    return { ok: true, stlBuffer: buffer, provider: json.provider ?? "trellis" };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? `Mesh worker timed out (${Math.round(WORKER_TIMEOUT_MS / 1000)}s)`
        : error instanceof Error
          ? error.message
          : String(error);
    return { ok: false, error: message, provider: "trellis" };
  } finally {
    clearTimeout(timer);
  }
}

async function generateViaPiapiTrellis(input: GenerateMeshInput): Promise<GenerateMeshResult> {
  const apiKey = resolvePiapiApiKey(input.piapiApiKey);
  if (!apiKey) {
    return {
      ok: false,
      error: "PIAPI_API_KEY not configured. Add PiAPI Trellis key in Settings → AI & Chei API.",
      provider: "piapi-trellis",
    };
  }

  const fdmPrompt =
    `${input.prompt.trim()}. FDM 3D printable, watertight manifold mesh, flat base for bed adhesion, minimum wall thickness 1.2mm.`;

  const ssSteps = Number(process.env.PIAPI_TRELLIS_SS_STEPS ?? 12);
  const slatSteps = Number(process.env.PIAPI_TRELLIS_SLAT_STEPS ?? 12);

  const createRes = await fetch(`${PIAPI_BASE}/api/v1/task`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "Qubico/trellis",
      task_type: "text-to-3d",
      input: {
        prompt: fdmPrompt.slice(0, 2000),
        ss_sampling_steps: Math.min(50, Math.max(1, ssSteps)),
        slat_sampling_steps: Math.min(50, Math.max(1, slatSteps)),
        ss_guidance_strength: 7.5,
        slat_guidance_strength: 3,
        seed: 0,
      },
    }),
  });

  const createText = await createRes.text();
  let createJson: {
    code?: number;
    message?: string;
    data?: { task_id?: string; status?: string; error?: { message?: string } };
  } = {};
  try {
    createJson = JSON.parse(createText) as typeof createJson;
  } catch {
    return {
      ok: false,
      error: `PiAPI Trellis create failed (${createRes.status}): ${createText.slice(0, 300)}`,
      provider: "piapi-trellis",
    };
  }

  const taskId = createJson.data?.task_id;
  if (!createRes.ok || createJson.code !== 200 || !taskId) {
    return {
      ok: false,
      error:
        createJson.data?.error?.message ||
        createJson.message ||
        `PiAPI Trellis create failed (${createRes.status})`,
      provider: "piapi-trellis",
      meshTaskId: taskId,
    };
  }

  const started = Date.now();
  while (Date.now() - started < POLL_MAX_MS) {
    const pollRes = await fetch(`${PIAPI_BASE}/api/v1/task/${encodeURIComponent(taskId)}`, {
      headers: { "x-api-key": apiKey },
    });
    const pollText = await pollRes.text();
    let pollJson: {
      code?: number;
      message?: string;
      data?: {
        status?: string;
        output?: { model_file?: string; model_urls?: { glb?: string; stl?: string } } | null;
        error?: { message?: string; raw_message?: string };
      };
    } = {};
    try {
      pollJson = JSON.parse(pollText) as typeof pollJson;
    } catch {
      return {
        ok: false,
        error: `PiAPI Trellis poll bad JSON (${pollRes.status})`,
        provider: "piapi-trellis",
        meshTaskId: taskId,
      };
    }

    const status = (pollJson.data?.status ?? "").toLowerCase();
    if (status === "completed") {
      const modelFile =
        pollJson.data?.output?.model_file ||
        pollJson.data?.output?.model_urls?.stl ||
        pollJson.data?.output?.model_urls?.glb;
      if (!modelFile) {
        return {
          ok: false,
          error: "PiAPI Trellis completed but no model_file URL",
          provider: "piapi-trellis",
          meshTaskId: taskId,
        };
      }

      const downloaded = await downloadBytes(modelFile);
      if (!downloaded.ok || !downloaded.buffer) {
        return {
          ok: false,
          error: downloaded.error,
          provider: "piapi-trellis",
          meshTaskId: taskId,
        };
      }

      let stlBuffer = downloaded.buffer;
      const looksGlb =
        modelFile.toLowerCase().includes(".glb") ||
        downloaded.buffer.subarray(0, 4).toString("ascii") === "glTF";
      if (looksGlb) {
        try {
          stlBuffer = await convertGlbToStl(downloaded.buffer);
        } catch (err) {
          return {
            ok: false,
            error: `GLB→STL failed: ${err instanceof Error ? err.message : String(err)}`,
            provider: "piapi-trellis",
            meshTaskId: taskId,
          };
        }
      }

      if (stlBuffer.length < 84) {
        return {
          ok: false,
          error: "Converted STL is invalid",
          provider: "piapi-trellis",
          meshTaskId: taskId,
        };
      }

      return {
        ok: true,
        stlBuffer,
        meshTaskId: taskId,
        provider: "piapi-trellis",
      };
    }

    if (status === "failed") {
      return {
        ok: false,
        error:
          pollJson.data?.error?.message ||
          pollJson.data?.error?.raw_message ||
          pollJson.message ||
          "PiAPI Trellis task failed",
        provider: "piapi-trellis",
        meshTaskId: taskId,
      };
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  return {
    ok: false,
    error: "PiAPI Trellis timed out",
    provider: "piapi-trellis",
    meshTaskId: taskId,
  };
}

async function generateViaMeshy(input: GenerateMeshInput): Promise<GenerateMeshResult> {
  const apiKey = resolveMeshApiKey(input.meshApiKey);
  if (!apiKey) {
    return {
      ok: false,
      error: "MESHY_API_KEY not configured. Add mesh.apiKey in Settings or MESHY_API_KEY on the CAD server.",
      provider: "meshy",
    };
  }

  const fdmSuffix =
    " FDM 3D printable, watertight manifold mesh, flat base for bed adhesion, minimum wall thickness 1.2mm.";

  const createBody: Record<string, unknown> = input.previousMeshTaskId
    ? {
        mode: "refine",
        preview_task_id: input.previousMeshTaskId,
        enable_pbr: false,
        target_formats: ["stl"],
      }
    : {
        mode: "preview",
        prompt: `${input.prompt.trim()}${fdmSuffix}`,
        art_style: input.artStyle ?? "sculpture",
        target_formats: ["stl"],
      };

  const created = await createMeshyTask(apiKey, createBody);
  if (!created.ok || !created.taskId) {
    return { ok: false, error: created.error, provider: "meshy" };
  }

  const polled = await pollMeshyTask(apiKey, created.taskId);
  if (!polled.ok || !polled.task) {
    return { ok: false, error: polled.error, meshTaskId: created.taskId, provider: "meshy" };
  }

  const stlUrl = polled.task.model_urls?.stl ?? polled.task.model_urls?.obj;
  if (!stlUrl) {
    return {
      ok: false,
      error: "Meshy task succeeded but no STL/OBJ URL was returned",
      meshTaskId: created.taskId,
      provider: "meshy",
    };
  }

  const downloaded = await downloadBytes(stlUrl);
  if (!downloaded.ok || !downloaded.buffer) {
    return { ok: false, error: downloaded.error, meshTaskId: created.taskId, provider: "meshy" };
  }

  return {
    ok: true,
    stlBuffer: downloaded.buffer,
    meshTaskId: created.taskId,
    provider: "meshy",
  };
}

/**
 * Robotics text-to-3D priority:
 * 1) PiAPI hosted Trellis
 * 2) Self-hosted MESH_WORKER_URL
 * 3) Meshy fallback
 */
export async function generateMeshFromPrompt(input: GenerateMeshInput): Promise<GenerateMeshResult> {
  const hasPiapi = Boolean(resolvePiapiApiKey(input.piapiApiKey));
  const workerUrl = resolveMeshWorkerUrl();
  const hasMeshy = Boolean(resolveMeshApiKey(input.meshApiKey));

  if (!hasPiapi && !workerUrl && !hasMeshy) {
    return {
      ok: false,
      error:
        "No text-to-3D provider configured. Add PIAPI_API_KEY (Trellis) or MESHY_API_KEY in Settings, or set MESH_WORKER_URL on the CAD server.",
    };
  }

  // Refine is Meshy-specific (preview_task_id).
  if (input.previousMeshTaskId && hasMeshy) {
    return generateViaMeshy(input);
  }

  const errors: string[] = [];

  if (hasPiapi) {
    const piapi = await generateViaPiapiTrellis(input);
    if (piapi.ok) return piapi;
    errors.push(`PiAPI Trellis: ${piapi.error}`);
  }

  if (workerUrl) {
    const oss = await generateViaOssWorker(input);
    if (oss.ok) return oss;
    errors.push(`OSS worker: ${oss.error}`);
  }

  if (hasMeshy) {
    const meshy = await generateViaMeshy(input);
    if (meshy.ok) return meshy;
    errors.push(`Meshy: ${meshy.error}`);
    return {
      ok: false,
      error: errors.join(" · "),
      provider: "meshy",
      meshTaskId: meshy.meshTaskId,
    };
  }

  return {
    ok: false,
    error: errors.join(" · ") || "Text-to-3D failed",
    provider: hasPiapi ? "piapi-trellis" : "trellis",
  };
}
