/**
 * Ollama health for fallback eligibility.
 * GET http://127.0.0.1:11434/api/tags — 2s timeout, 5s status cache.
 */

import { OLLAMA_TAGS_URL } from "../../src/shared/local-ai-contract";

export const OLLAMA_FALLBACK_HEALTH_TIMEOUT_MS = 2_000;
export const OLLAMA_FALLBACK_HEALTH_INTERVAL_MS = 5_000;

export interface OllamaFallbackHealth {
  ok: boolean;
  checkedAt: number;
}

let cache: OllamaFallbackHealth | null = null;
let inFlight: Promise<OllamaFallbackHealth> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

export function getCachedOllamaFallbackHealth(): OllamaFallbackHealth | null {
  return cache;
}

export function clearOllamaFallbackHealthCache(): void {
  cache = null;
  inFlight = null;
}

async function probeTags(): Promise<OllamaFallbackHealth> {
  const checkedAt = Date.now();
  try {
    const res = await fetch(OLLAMA_TAGS_URL, {
      method: "GET",
      signal: AbortSignal.timeout(OLLAMA_FALLBACK_HEALTH_TIMEOUT_MS),
    });
    return { ok: res.ok, checkedAt };
  } catch {
    return { ok: false, checkedAt };
  }
}

export async function refreshOllamaFallbackHealth(force = false): Promise<OllamaFallbackHealth> {
  const now = Date.now();
  if (
    !force &&
    cache &&
    now - cache.checkedAt < OLLAMA_FALLBACK_HEALTH_INTERVAL_MS
  ) {
    return cache;
  }
  if (!force && inFlight) return inFlight;
  inFlight = probeTags().then((result) => {
    cache = result;
    inFlight = null;
    return result;
  });
  return inFlight;
}

/** True only when the last (or fresh) probe succeeded. Down Ollama is excluded from chains. */
export async function isOllamaEligibleForFallback(): Promise<boolean> {
  const health = await refreshOllamaFallbackHealth();
  return health.ok;
}

export function startOllamaFallbackHealthMonitor(): void {
  if (pollTimer) return;
  void refreshOllamaFallbackHealth(true);
  pollTimer = setInterval(() => {
    void refreshOllamaFallbackHealth(true);
  }, OLLAMA_FALLBACK_HEALTH_INTERVAL_MS);
  if (typeof pollTimer === "object" && "unref" in pollTimer) {
    pollTimer.unref();
  }
}

export function stopOllamaFallbackHealthMonitor(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
