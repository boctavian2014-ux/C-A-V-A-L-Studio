const DEFAULT_OLLAMA_BASE = 'http://localhost:11434';

export function getOllamaBaseUrl(): string {
  const fromEnv =
    typeof process !== 'undefined'
      ? process.env.OLLAMA_BASE_URL?.replace(/\/api\/chat\/?$/, '')
      : undefined;
  return fromEnv ?? DEFAULT_OLLAMA_BASE;
}

const OLLAMA_REACHABLE_TTL_MS = 30_000;
let ollamaReachableCache: { ok: boolean; at: number } | null = null;

export async function isOllamaReachable(): Promise<boolean> {
  const now = Date.now();
  if (ollamaReachableCache && now - ollamaReachableCache.at < OLLAMA_REACHABLE_TTL_MS) {
    return ollamaReachableCache.ok;
  }
  try {
    const res = await fetch(`${getOllamaBaseUrl()}/api/tags`, {
      signal: AbortSignal.timeout(1_500),
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
    const res = await fetch(`${getOllamaBaseUrl()}/api/tags`);
    if (!res.ok) return [];
    const json = (await res.json()) as { models?: Array<{ name: string }> };
    return (json.models ?? []).map((m) => m.name);
  } catch {
    return [];
  }
}
