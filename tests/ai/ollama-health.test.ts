import { afterEach, describe, expect, it, vi } from "vitest";

import {
  OLLAMA_FALLBACK_HEALTH_TIMEOUT_MS,
  clearOllamaFallbackHealthCache,
  isOllamaEligibleForFallback,
  refreshOllamaFallbackHealth,
  stopOllamaFallbackHealthMonitor,
} from "../../ai/providers/ollama-health";
import { OLLAMA_TAGS_URL } from "../../src/shared/local-ai-contract";

afterEach(() => {
  stopOllamaFallbackHealthMonitor();
  clearOllamaFallbackHealthCache();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("ollama fallback health", () => {
  it("probes GET /api/tags with a 2s timeout", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const health = await refreshOllamaFallbackHealth(true);
    expect(health.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(OLLAMA_TAGS_URL);
    expect(init.method).toBe("GET");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(OLLAMA_FALLBACK_HEALTH_TIMEOUT_MS).toBe(2_000);
  });

  it("caches status for 5s and treats a failed probe as ineligible", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T12:00:00Z"));
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    expect(await isOllamaEligibleForFallback()).toBe(false);
    expect(await isOllamaEligibleForFallback()).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-08-31T12:00:06Z"));
    expect(await isOllamaEligibleForFallback()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
