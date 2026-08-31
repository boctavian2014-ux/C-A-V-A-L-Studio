import { describe, expect, it, vi } from "vitest";

import { DEFAULT_MODEL_FALLBACK } from "../../ai/config/model-fallback-chain";
import { ProviderCircuitBreaker } from "../../ai/providers/circuit-breaker";
import { SafeProviderError } from "../../ai/providers/provider-errors";
import {
  AGENTIC_PROVIDER_UNAVAILABLE,
  executeModeAwareFallback,
  logFallbackSwitch,
  resolveRuntimeFallbackChain,
} from "../../ai/providers/fallback-executor";

function nvidia429() {
  return new SafeProviderError("rate_limited", "nvidia rate limited", {
    httpStatus: 429,
    retryable: true,
    retryAfterMs: 8_000,
  });
}

function timeoutErr() {
  return new SafeProviderError("request_timeout", "nvidia request timed out", { retryable: true });
}

describe("fallback chain and circuit breaker behavior", () => {
  it("code mode: NVIDIA 429 falls back to Ollama when healthy", async () => {
    const breaker = new ProviderCircuitBreaker({ failureThreshold: 3, cooldownMs: 30_000 });
    const result = await executeModeAwareFallback({
      mode: "code",
      config: DEFAULT_MODEL_FALLBACK,
      breaker,
      isOllamaHealthy: async () => true,
      execute: async (providerId) => {
        if (providerId === "nvidia") throw nvidia429();
        return { ok: true as const, providerId };
      },
    });
    expect(result.providerId).toBe("ollama");
    expect(result.fallbackFrom).toBe("nvidia");
    expect(result.fallbackReason).toBe("http429");
  });

  it("agentic mode: NVIDIA 429 yields AGENTIC_PROVIDER_UNAVAILABLE without Ollama", async () => {
    const breaker = new ProviderCircuitBreaker({ failureThreshold: 1, cooldownMs: 30_000 });
    const calls: string[] = [];
    await expect(
      executeModeAwareFallback({
        mode: "agentic",
        config: DEFAULT_MODEL_FALLBACK,
        breaker,
        isOllamaHealthy: async () => true,
        execute: async (providerId) => {
          calls.push(providerId);
          throw nvidia429();
        },
      })
    ).rejects.toMatchObject({
      code: AGENTIC_PROVIDER_UNAVAILABLE,
      providerId: expect.stringMatching(/nvidia|openrouter/),
    });
    expect(calls).not.toContain("ollama");
  });

  it("NVIDIA down + Ollama down: one attempt each, no infinite retry", async () => {
    const breaker = new ProviderCircuitBreaker({ failureThreshold: 99, cooldownMs: 5_000 });
    const calls: string[] = [];
    await expect(
      executeModeAwareFallback({
        mode: "ask",
        config: DEFAULT_MODEL_FALLBACK,
        breaker,
        isOllamaHealthy: async () => true,
        execute: async (providerId) => {
          calls.push(providerId);
          throw timeoutErr();
        },
      })
    ).rejects.toBeTruthy();
    expect(calls).toEqual(["nvidia", "ollama"]);
  });

  it("excludes Ollama from every chain while health check is down", async () => {
    const codeChain = await resolveRuntimeFallbackChain({
      mode: "code",
      config: DEFAULT_MODEL_FALLBACK,
      isOllamaHealthy: async () => false,
    });
    const askChain = await resolveRuntimeFallbackChain({
      mode: "ask",
      config: DEFAULT_MODEL_FALLBACK,
      isOllamaHealthy: async () => false,
    });
    const agenticChain = await resolveRuntimeFallbackChain({
      mode: "agentic",
      config: DEFAULT_MODEL_FALLBACK,
      isOllamaHealthy: async () => true,
    });
    expect(codeChain).not.toContain("ollama");
    expect(askChain).not.toContain("ollama");
    expect(agenticChain).not.toContain("ollama");
  });

  it("circuit breaker: 3 consecutive failures open, cooldown then half-open, success closes", () => {
    let now = 0;
    const breaker = new ProviderCircuitBreaker({
      failureThreshold: 3,
      cooldownMs: 10_000,
      now: () => now,
    });
    breaker.recordFailure("nvidia");
    breaker.recordFailure("nvidia");
    breaker.recordFailure("nvidia");
    expect(breaker.getState("nvidia")).toBe("open");
    now = 10_000;
    expect(breaker.getState("nvidia")).toBe("half-open");
    expect(breaker.allowRequest("nvidia")).toBe(true);
    breaker.recordSuccess("nvidia");
    expect(breaker.getState("nvidia")).toBe("closed");
  });

  it("does not log API keys on provider switch", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    logFallbackSwitch({ fromProvider: "nvidia", toProvider: "ollama", reason: "http429" });
    const dumped = spy.mock.calls.map((c) => JSON.stringify(c)).join("\n");
    expect(dumped).not.toMatch(/nvapi-|sk-or-|OPENROUTER_API_KEY|NVIDIA_API_KEY/i);
    spy.mockRestore();
  });
});
