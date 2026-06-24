// ──────────────────────────────────────────────
//  OpenRouter model catalog — fetch + cache
// ──────────────────────────────────────────────

export interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
  pricing: {
    prompt: string;
    completion: string;
  };
  top_provider?: {
    max_completion_tokens?: number;
  };
}

export interface OpenRouterCatalogEntry {
  id: string;
  label: string;
  provider: string;
  contextWindow: number;
  isFree: boolean;
  source: "openrouter";
  color: string;
}

const CACHE_TTL_MS = 60 * 60 * 1000;
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

let cached: { fetchedAt: number; models: OpenRouterCatalogEntry[] } | null = null;

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: "#C678DD",
  openai: "#2FBF71",
  google: "#61AFEF",
  meta: "#3B82F6",
  mistralai: "#F59E0B",
  qwen: "#E06C75",
  deepseek: "#56B6C2",
  default: "#8A95A6",
};

function providerFromId(id: string): string {
  const slash = id.indexOf("/");
  return slash > 0 ? id.slice(0, slash) : "openrouter";
}

function colorForProvider(provider: string): string {
  return PROVIDER_COLORS[provider] ?? PROVIDER_COLORS.default;
}

function isFreeModel(model: OpenRouterModel): boolean {
  const prompt = model.pricing?.prompt ?? "0";
  const completion = model.pricing?.completion ?? "0";
  if (prompt === "0" && completion === "0") return true;
  if (model.id.includes(":free") || model.id.endsWith("/free")) return true;
  const promptNum = parseFloat(prompt);
  return !Number.isNaN(promptNum) && promptNum === 0;
}

function mapEntry(model: OpenRouterModel): OpenRouterCatalogEntry {
  const provider = providerFromId(model.id);
  return {
    id: `openrouter:${model.id}`,
    label: model.name,
    provider,
    contextWindow: model.context_length ?? 32_000,
    isFree: isFreeModel(model),
    source: "openrouter",
    color: colorForProvider(provider),
  };
}

export async function fetchOpenRouterCatalog(force = false): Promise<OpenRouterCatalogEntry[]> {
  if (!force && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.models;
  }

  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const res = await fetch(OPENROUTER_MODELS_URL, { headers });
    if (!res.ok) {
      return cached?.models ?? [];
    }

    const json = (await res.json()) as { data?: OpenRouterModel[] };
    const models = (json.data ?? []).map(mapEntry);
    cached = { fetchedAt: Date.now(), models };
    return models;
  } catch {
    return cached?.models ?? [];
  }
}

export function clearOpenRouterCache(): void {
  cached = null;
}
