import {
  buildCadLlmPrompt,
  buildScadRepairPrompt,
  stripScadFences,
  validateScadSource,
} from "./scad-prompt";
import { fallbackScadForPrompt } from "./scad-runner";
import type { CadConstraints, CadPlanContext } from "./types";

export interface GenerateOpenScadResult {
  ok: boolean;
  scad?: string;
  error?: string;
  usedFallback?: boolean;
  model?: string;
  attempts?: number;
}

const DEFAULT_MODEL = process.env.CAD_LLM_MODEL ?? "openai/gpt-4o-mini";
const MAX_ATTEMPTS = Number(process.env.CAD_LLM_MAX_ATTEMPTS ?? 3);

function resolveApiKey(override?: string): string | undefined {
  const key = override?.trim() || process.env.OPENROUTER_API_KEY?.trim();
  return key || undefined;
}

function allowFallback(): boolean {
  return process.env.CAD_ALLOW_FALLBACK === "1";
}

async function callOpenRouter(
  apiKey: string,
  model: string,
  system: string,
  user: string
): Promise<{ ok: boolean; content?: string; error?: string; status?: number }> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.CAD_PUBLIC_URL ?? "https://caval.studio",
        "X-Title": "Caval Studio CAD",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.25,
        max_tokens: 8192,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return { ok: false, error: `LLM HTTP ${response.status}: ${text.slice(0, 300)}`, status: response.status };
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) {
      return { ok: false, error: "LLM returned empty content" };
    }
    return { ok: true, content };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function generateWithRetries(input: {
  prompt: string;
  projectType?: string;
  constraints?: CadConstraints;
  planContext?: CadPlanContext;
  apiKey: string;
  model: string;
}): Promise<GenerateOpenScadResult> {
  const { system, user } = buildCadLlmPrompt(input);
  let lastError = "Unknown LLM error";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const retryNote =
      attempt > 1
        ? `\n\nPrevious attempt failed validation. Return ONLY valid OpenSCAD with primitives and a top-level render. Match the part request exactly.`
        : "";
    const result = await callOpenRouter(
      input.apiKey,
      input.model,
      system,
      user + retryNote
    );

    if (!result.ok) {
      lastError = result.error ?? lastError;
      if (result.status === 401 || result.status === 403) break;
      continue;
    }

    const scad = stripScadFences(result.content!);
    const validation = validateScadSource(scad);
    if (validation.ok) {
      return { ok: true, scad, model: input.model, attempts: attempt };
    }
    lastError = validation.reason ?? "Validation failed";
  }

  if (allowFallback()) {
    return {
      ok: true,
      scad: fallbackScadForPrompt(input.prompt),
      usedFallback: true,
      error: `LLM failed after ${MAX_ATTEMPTS} attempts: ${lastError}`,
      model: input.model,
      attempts: MAX_ATTEMPTS,
    };
  }

  return {
    ok: false,
    error: `OpenSCAD generation failed after ${MAX_ATTEMPTS} attempts: ${lastError}. Configure OPENROUTER_API_KEY on the CAD server.`,
    model: input.model,
    attempts: MAX_ATTEMPTS,
  };
}

export async function generateOpenScad(input: {
  prompt: string;
  projectType?: string;
  constraints?: CadConstraints;
  planContext?: CadPlanContext;
  openRouterApiKey?: string;
}): Promise<GenerateOpenScadResult> {
  const apiKey = resolveApiKey(input.openRouterApiKey);
  const model = DEFAULT_MODEL;

  if (!apiKey) {
    if (allowFallback()) {
      const scad = fallbackScadForPrompt(input.prompt);
      return {
        ok: true,
        scad,
        usedFallback: true,
        error: "OPENROUTER_API_KEY not configured — mock geometry",
      };
    }
    return {
      ok: false,
      error: "OPENROUTER_API_KEY not configured on CAD server. Add it in Railway env or Settings → OpenRouter.",
    };
  }

  return generateWithRetries({ ...input, apiKey, model });
}

export async function repairOpenScad(input: {
  originalPrompt: string;
  brokenScad: string;
  renderError: string;
  openRouterApiKey?: string;
}): Promise<GenerateOpenScadResult> {
  const apiKey = resolveApiKey(input.openRouterApiKey);
  if (!apiKey) {
    return { ok: false, error: "No OpenRouter API key for SCAD repair" };
  }

  const { system, user } = buildScadRepairPrompt(input);
  const result = await callOpenRouter(apiKey, DEFAULT_MODEL, system, user);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  const scad = stripScadFences(result.content!);
  const validation = validateScadSource(scad);
  if (!validation.ok) {
    return { ok: false, error: validation.reason ?? "Repaired SCAD failed validation" };
  }
  return { ok: true, scad, model: DEFAULT_MODEL, attempts: 1 };
}
