const MESHY_BASE = "https://api.meshy.ai/openapi/v2/text-to-3d";
const POLL_INTERVAL_MS = Number(process.env.MESH_POLL_MS ?? 3000);
const POLL_MAX_MS = Number(process.env.MESH_POLL_MAX_MS ?? 300_000);

export interface GenerateMeshInput {
  prompt: string;
  meshApiKey?: string;
  previousMeshTaskId?: string;
  artStyle?: "realistic" | "sculpture";
}

export interface GenerateMeshResult {
  ok: boolean;
  stlBuffer?: Buffer;
  meshTaskId?: string;
  error?: string;
}

function resolveMeshApiKey(override?: string): string | undefined {
  return override?.trim() || process.env.MESHY_API_KEY?.trim() || undefined;
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

async function downloadStl(url: string): Promise<{ ok: boolean; buffer?: Buffer; error?: string }> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { ok: false, error: `STL download failed (${response.status})` };
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 84) {
      return { ok: false, error: "Downloaded STL file is too small or invalid" };
    }
    return { ok: true, buffer };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function generateMeshFromPrompt(input: GenerateMeshInput): Promise<GenerateMeshResult> {
  const apiKey = resolveMeshApiKey(input.meshApiKey);
  if (!apiKey) {
    return {
      ok: false,
      error: "MESHY_API_KEY not configured. Add mesh.apiKey in Settings or MESHY_API_KEY on the CAD server.",
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
    return { ok: false, error: created.error };
  }

  const polled = await pollMeshyTask(apiKey, created.taskId);
  if (!polled.ok || !polled.task) {
    return { ok: false, error: polled.error, meshTaskId: created.taskId };
  }

  const stlUrl = polled.task.model_urls?.stl ?? polled.task.model_urls?.obj;
  if (!stlUrl) {
    return {
      ok: false,
      error: "Meshy task succeeded but no STL/OBJ URL was returned",
      meshTaskId: created.taskId,
    };
  }

  const downloaded = await downloadStl(stlUrl);
  if (!downloaded.ok || !downloaded.buffer) {
    return { ok: false, error: downloaded.error, meshTaskId: created.taskId };
  }

  return { ok: true, stlBuffer: downloaded.buffer, meshTaskId: created.taskId };
}
