/**
 * Zoo / KittyCAD text-to-CAD client.
 * POST /ai/text-to-cad/{output_format} → poll GET /ai/text-to-cad/{id} until completed.
 * CAD_ZOO_MOCK=1 (or missing token in mock mode) returns a completed job with a tiny STL buffer.
 */

import type { ZooJobRequest, ZooJobResponse, ZooOutputFormat } from "../../src/shared/cad-zoo-contract";

const DEFAULT_ZOO_API_URL = "https://api.zoo.dev";
const POLL_INTERVAL_MS = Number(process.env.CAD_ZOO_POLL_MS ?? 2_000);
const POLL_MAX_MS = Number(process.env.CAD_ZOO_POLL_MAX_MS ?? 300_000);

export interface GenerateZooMeshInput {
  prompt: string;
  zooApiToken?: string;
  outputFormat?: ZooOutputFormat;
  /** Optional KCL script (Phase 2+). */
  kcl?: string;
  previousZooJobId?: string;
  signal?: AbortSignal;
}

export interface GenerateZooMeshResult {
  ok: boolean;
  stlBuffer?: Buffer;
  zooJobId?: string;
  provider?: "zoo" | "zoo-mock";
  error?: string;
}

export function resolveZooApiUrl(): string {
  return (process.env.ZOO_API_URL?.trim() || DEFAULT_ZOO_API_URL).replace(/\/+$/, "");
}

export function resolveZooApiToken(override?: string): string | undefined {
  return override?.trim() || process.env.ZOO_API_TOKEN?.trim() || undefined;
}

export function isZooMockMode(): boolean {
  return process.env.CAD_ZOO_MOCK === "1" || process.env.CAD_ZOO_MOCK === "true";
}

export function isZooGenerationConfigured(tokenOverride?: string): boolean {
  return isZooMockMode() || Boolean(resolveZooApiToken(tokenOverride));
}

/** Minimal valid binary STL: one triangle (flat plate). */
export function buildMockStlBuffer(prompt = "mock"): Buffer {
  const header = Buffer.alloc(80, 0);
  header.write(`caval-zoo-mock ${prompt.slice(0, 48)}`, 0, "utf8");
  const count = Buffer.alloc(4);
  count.writeUInt32LE(1, 0);
  const tri = Buffer.alloc(50);
  // normal
  tri.writeFloatLE(0, 0);
  tri.writeFloatLE(0, 4);
  tri.writeFloatLE(1, 8);
  // v0
  tri.writeFloatLE(0, 12);
  tri.writeFloatLE(0, 16);
  tri.writeFloatLE(0, 20);
  // v1
  tri.writeFloatLE(20, 24);
  tri.writeFloatLE(0, 28);
  tri.writeFloatLE(0, 32);
  // v2
  tri.writeFloatLE(10, 36);
  tri.writeFloatLE(20, 40);
  tri.writeFloatLE(0, 44);
  return Buffer.concat([header, count, tri]);
}

export function mockZooJob(prompt: string, format: ZooOutputFormat = "stl"): ZooJobResponse {
  const now = new Date().toISOString();
  const id = `mock-${Date.now()}`;
  return {
    id,
    status: "completed",
    outputs: {
      [format]: `mock://zoo/${id}.${format}?q=${encodeURIComponent(prompt.slice(0, 64))}`,
    },
    createdAt: now,
    completedAt: now,
  };
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

export async function createZooJob(
  request: ZooJobRequest,
  token: string
): Promise<ZooJobResponse> {
  if (isZooMockMode()) {
    return mockZooJob(request.prompt, request.outputFormat);
  }

  const format = request.outputFormat || "stl";
  const url = `${resolveZooApiUrl()}/ai/text-to-cad/${format}`;
  const body: Record<string, unknown> = { prompt: request.prompt };
  if (request.kcl?.trim()) body.kcl = request.kcl.trim();

  const response = await fetch(url, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Zoo API error: ${response.status}${text ? ` ${text.slice(0, 200)}` : ""}`);
  }

  return (await response.json()) as ZooJobResponse;
}

export async function pollZooJob(jobId: string, token: string): Promise<ZooJobResponse> {
  if (isZooMockMode()) {
    return mockZooJob("polled");
  }

  const response = await fetch(`${resolveZooApiUrl()}/ai/text-to-cad/${jobId}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Zoo poll error: ${response.status}${text ? ` ${text.slice(0, 200)}` : ""}`);
  }

  return (await response.json()) as ZooJobResponse;
}

async function downloadStlFromUrl(url: string, signal?: AbortSignal): Promise<Buffer> {
  if (url.startsWith("mock://")) {
    return buildMockStlBuffer(url);
  }
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Zoo STL download failed: ${response.status}`);
  }
  const ab = await response.arrayBuffer();
  return Buffer.from(ab);
}

/**
 * Create (or reuse) a Zoo job, poll until completed/failed, download STL.
 * Failed Zoo calls do not charge — caller may fall back to OpenSCAD.
 */
export async function generateZooStlFromPrompt(
  input: GenerateZooMeshInput
): Promise<GenerateZooMeshResult> {
  if (isZooMockMode()) {
    const job = mockZooJob(input.prompt, input.outputFormat ?? "stl");
    return {
      ok: true,
      stlBuffer: buildMockStlBuffer(input.prompt),
      zooJobId: job.id,
      provider: "zoo-mock",
    };
  }

  const token = resolveZooApiToken(input.zooApiToken);
  if (!token) {
    return {
      ok: false,
      error: "Zoo not configured. Add ZOO_API_TOKEN in Settings → CAD (or set CAD_ZOO_MOCK=1 for local tests).",
      provider: "zoo",
    };
  }

  try {
    let job: ZooJobResponse;
    if (input.previousZooJobId?.trim()) {
      job = await pollZooJob(input.previousZooJobId.trim(), token);
    } else {
      job = await createZooJob(
        {
          prompt: input.prompt,
          outputFormat: input.outputFormat ?? "stl",
          kcl: input.kcl,
        },
        token
      );
    }

    const started = Date.now();
    while (job.status === "queued" || job.status === "processing") {
      if (input.signal?.aborted) {
        return { ok: false, error: "Job cancelled", zooJobId: job.id, provider: "zoo" };
      }
      if (Date.now() - started > POLL_MAX_MS) {
        return {
          ok: false,
          error: `Zoo job timed out after ${POLL_MAX_MS}ms`,
          zooJobId: job.id,
          provider: "zoo",
        };
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      job = await pollZooJob(job.id, token);
    }

    if (job.status === "failed") {
      return {
        ok: false,
        error: job.error || "Zoo text-to-CAD failed",
        zooJobId: job.id,
        provider: "zoo",
      };
    }

    const stlUrl = job.outputs?.stl;
    if (!stlUrl) {
      return {
        ok: false,
        error: "Zoo job completed without STL output",
        zooJobId: job.id,
        provider: "zoo",
      };
    }

    const stlBuffer = await downloadStlFromUrl(stlUrl, input.signal);
    return {
      ok: true,
      stlBuffer,
      zooJobId: job.id,
      provider: "zoo",
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      provider: "zoo",
    };
  }
}
