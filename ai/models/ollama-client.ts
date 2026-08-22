import {
  getOllamaLoopbackUrl,
  OLLAMA_HEALTH_TIMEOUT_MS,
  OLLAMA_TAGS_URL,
} from "../../src/shared/local-ai-contract";

/** Always loopback — ignores arbitrary OLLAMA_BASE_URL / settings overrides. */
export function getOllamaBaseUrl(): string {
  return getOllamaLoopbackUrl();
}

const OLLAMA_REACHABLE_TTL_MS = 30_000;
let ollamaReachableCache: { ok: boolean; at: number } | null = null;

export function clearOllamaReachableCache(): void {
  ollamaReachableCache = null;
}

export async function isOllamaReachable(options?: { force?: boolean }): Promise<boolean> {
  const now = Date.now();
  if (
    !options?.force &&
    ollamaReachableCache &&
    now - ollamaReachableCache.at < OLLAMA_REACHABLE_TTL_MS
  ) {
    return ollamaReachableCache.ok;
  }
  try {
    const res = await fetch(OLLAMA_TAGS_URL, {
      signal: AbortSignal.timeout(OLLAMA_HEALTH_TIMEOUT_MS),
    });
    const ok = res.ok;
    ollamaReachableCache = { ok, at: now };
    return ok;
  } catch {
    ollamaReachableCache = { ok: false, at: now };
    return false;
  }
}

export async function fetchInstalledOllamaModels(): Promise<string[]> {
  try {
    const res = await fetch(OLLAMA_TAGS_URL, {
      signal: AbortSignal.timeout(OLLAMA_HEALTH_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { models?: Array<{ name: string }> };
    return (json.models ?? []).map((m) => m.name);
  } catch {
    return [];
  }
}
