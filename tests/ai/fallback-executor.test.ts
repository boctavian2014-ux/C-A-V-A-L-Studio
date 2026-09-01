import { describe, expect, it } from "vitest";

import { DEFAULT_MODEL_FALLBACK } from "../../ai/config/model-fallback-chain";
import { ProviderCircuitBreaker } from "../../ai/providers/circuit-breaker";
import { SafeProviderError } from "../../ai/providers/provider-errors";
import {
  AGENTIC_PROVIDER_UNAVAILABLE,
  AgenticProviderUnavailableError,
  executeModeAwareFallback,
  resolveRuntimeFallbackChain,
} from "../../ai/providers/fallback-executor";

function rateLimit() {
  return new SafeProviderError("rate_limited", "nvidia rate limited", {
    httpStatus: 429,
    retryable: true,
  });
}

describe("mode-aware fallback executor", () => {
  it("falls back NVIDIA -> Ollama once in code mode on 429 when Ollama is healthy", async () => {
    const breaker = new ProviderCircuitBreaker({ failureThreshold: 3, cooldownMs: 30_000 });
    const calls: string[] = [];
    const switches: Array<{ from: string; to: string | null }> = [];
    const result = await executeModeAwareFallback({
      mode: "code",
      config: DEFAULT_MODEL_FALLBACK,
      breaker,
      isOllamaHealthy: async () => true,
      log: (entry) => {
        switches.push({ from: entry.fromProvider, to: entry.toProvider });
        expect(JSON.stringify(entry)).not.toMatch(/nvapi-|sk-/i);
      },
      execute: async (providerId) => {
        calls.push(providerId);
        if (providerId === "nvidia") throw rateLimit();
        return { providerId };
      },
    });
    expect(calls).toEqual(["nvidia", "ollama"]);
    expect(result.providerId).toBe("ollama");
    expect(result.fallbackFrom).toBe("nvidia");
    expect(switches).toEqual([{ from: "nvidia", to: "ollama" }]);
  });

  it("does not use Ollama for agentic and returns AGENTIC_PROVIDER_UNAVAILABLE", async () => {
    const breaker = new ProviderCircuitBreaker({ failureThreshold: 1, cooldownMs: 12_000 });
    const calls: string[] = [];
    await expect(
      executeModeAwareFallback({
        mode: "agentic",
        config: DEFAULT_MODEL_FALLBACK,
        breaker,
        isOllamaHealthy: async () => true,
        execute: async (providerId) => {
          calls.push(providerId);
          throw rateLimit();
        },
      })
    ).rejects.toMatchObject({ code: AGENTIC_PROVIDER_UNAVAILABLE });
    expect(calls).not.toContain("ollama");
    expect(calls[0]).toBe("nvidia");
  });

  it("excludes Ollama from chains when health check fails", async () => {
    const chain = await resolveRuntimeFallbackChain({
      mode: "code",
      config: DEFAULT_MODEL_FALLBACK,
      isOllamaHealthy: async () => false,
    });
    expect(chain).not.toContain("ollama");
    expect(chain).toContain("nvidia");
  });

  it("does not loop infinitely when NVIDIA and Ollama both fail", async () => {
    const breaker = new ProviderCircuitBreaker({ failureThreshold: 99, cooldownMs: 1_000 });
    const calls: string[] = [];
    await expect(
      executeModeAwareFallback({
        mode: "code",
        config: DEFAULT_MODEL_FALLBACK,
        breaker,
        isOllamaHealthy: async () => true,
        execute: async (providerId) => {
          calls.push(providerId);
          throw rateLimit();
        },
      })
    ).rejects.toBeTruthy();
    expect(calls.filter((c) => c === "nvidia")).toHaveLength(1);
    expect(calls.filter((c) => c === "ollama")).toHaveLength(1);
  });
});

describe("AgenticProviderUnavailableError", () => {
  it("includes provider and cooldown without secrets", () => {
    const err = new AgenticProviderUnavailableError("nvidia", 15_000);
    expect(err.providerId).toBe("nvidia");
    expect(err.cooldownRemainingMs).toBe(15_000);
    expect(err.message).toMatch(/nvidia/i);
    expect(err.message).not.toMatch(/nvapi-/i);
  });
});
