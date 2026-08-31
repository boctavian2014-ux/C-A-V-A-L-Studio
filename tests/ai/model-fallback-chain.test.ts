import { describe, expect, it } from "vitest";

import { mergeCavalConfig } from "../../ai/config/caval-config-shared";
import {
  DEFAULT_MODEL_FALLBACK,
  FallbackChainConfigError,
  mergeModelFallbackConfig,
  validateModelFallbackConfig,
} from "../../ai/config/model-fallback-chain";
import { DEFAULT_CAVAL_CONFIG } from "../../ai/modes/agent-modes";

describe("models.fallback chain schema", () => {
  it("ships a valid default chain using registry provider ids", () => {
    expect(() => validateModelFallbackConfig(DEFAULT_MODEL_FALLBACK)).not.toThrow();
    expect(DEFAULT_CAVAL_CONFIG.models?.fallback?.chains.agentic).not.toContain("ollama");
    expect(DEFAULT_CAVAL_CONFIG.models?.fallback?.chains.code).toEqual(["nvidia", "ollama"]);
    expect(DEFAULT_CAVAL_CONFIG.models?.fallback?.triggers.http429).toBe(true);
    expect(DEFAULT_CAVAL_CONFIG.models?.fallback?.circuitBreaker.failureThreshold).toBe(3);
  });

  it("throws a clear error when a chain providerId is not in the registry", () => {
    expect(() =>
      mergeModelFallbackConfig({
        chains: { agentic: ["nvidia"], code: ["not-a-provider"], ask: ["ollama"] },
      })
    ).toThrow(FallbackChainConfigError);
    try {
      mergeModelFallbackConfig({
        chains: { agentic: ["nvidia"], code: ["not-a-provider"], ask: ["ollama"] },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(FallbackChainConfigError);
      const message = (error as Error).message;
      expect(message).toContain("not-a-provider");
      expect(message).toContain("registry");
      expect(message).toContain("nvidia");
    }
  });

  it("merges caval.jsonc models.fallback without dropping perMode", () => {
    const merged = mergeCavalConfig({
      models: {
        perMode: { code: "caval-auto/balanced" },
        fallback: {
          chains: { agentic: ["nvidia"], code: ["nvidia", "ollama"], ask: ["ollama"] },
          triggers: { http429: true, timeoutMs: 20_000, connectionRefused: true },
          circuitBreaker: { cooldownMs: 5_000, failureThreshold: 2 },
          maxRetriesPerProvider: 1,
        },
      },
    });
    expect(merged.models?.perMode?.code).toBe("caval-auto/balanced");
    expect(merged.models?.fallback?.triggers.timeoutMs).toBe(20_000);
    expect(merged.models?.fallback?.circuitBreaker.cooldownMs).toBe(5_000);
  });
});
