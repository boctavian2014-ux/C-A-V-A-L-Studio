/**
 * caval.jsonc models.fallback — NVIDIA NIM ↔ Ollama (and other registry providers).
 * Provider ids must match the AI provider registry.
 */

import { AI_PROVIDER_IDS, isAiProviderId, type AiProviderId } from "../../src/shared/ai-provider-contract";

export const FALLBACK_CHAIN_MODES = ["agentic", "code", "ask"] as const;
export type FallbackChainMode = (typeof FALLBACK_CHAIN_MODES)[number];

export const FALLBACK_TRIGGER_KINDS = ["http429", "timeoutMs", "connectionRefused"] as const;
export type FallbackTriggerKind = (typeof FALLBACK_TRIGGER_KINDS)[number];

export interface FallbackTriggersConfig {
  /** Switch on HTTP 429 / rate limit. */
  http429: boolean;
  /** Abort + failover after this many ms (provider request timeout). */
  timeoutMs: number;
  /** Switch on ECONNREFUSED / network down. */
  connectionRefused: boolean;
}

export interface FallbackCircuitBreakerConfig {
  cooldownMs: number;
  failureThreshold: number;
}

export interface ModelFallbackConfig {
  chains: Record<FallbackChainMode, AiProviderId[]>;
  triggers: FallbackTriggersConfig;
  circuitBreaker: FallbackCircuitBreakerConfig;
  /** Max attempts per provider in a chain (TASK 4: once). */
  maxRetriesPerProvider: number;
}

export class FallbackChainConfigError extends Error {
  readonly code = "FALLBACK_CHAIN_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "FallbackChainConfigError";
  }
}

export const DEFAULT_MODEL_FALLBACK: ModelFallbackConfig = {
  chains: {
    agentic: ["nvidia", "openrouter"],
    code: ["nvidia", "ollama"],
    ask: ["nvidia", "ollama"],
  },
  triggers: {
    http429: true,
    timeoutMs: 55_000,
    connectionRefused: true,
  },
  circuitBreaker: {
    cooldownMs: 30_000,
    failureThreshold: 3,
  },
  maxRetriesPerProvider: 1,
};

function asPositiveInt(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  return fallback;
}

function parseChain(mode: FallbackChainMode, raw: unknown): AiProviderId[] {
  const source = Array.isArray(raw) ? raw : DEFAULT_MODEL_FALLBACK.chains[mode];
  const ids: AiProviderId[] = [];
  for (const item of source) {
    if (typeof item !== "string" || !item.trim()) {
      throw new FallbackChainConfigError(
        `models.fallback.chains.${mode} contains an empty provider id. Use registry ids: ${AI_PROVIDER_IDS.join(", ")}.`
      );
    }
    if (!isAiProviderId(item)) {
      throw new FallbackChainConfigError(
        `Unknown providerId "${item}" in models.fallback.chains.${mode}. ` +
          `It is not in the AI provider registry. Known ids: ${AI_PROVIDER_IDS.join(", ")}.`
      );
    }
    if (!ids.includes(item)) ids.push(item);
  }
  if (ids.length === 0) {
    throw new FallbackChainConfigError(
      `models.fallback.chains.${mode} must list at least one providerId from the registry.`
    );
  }
  return ids;
}

export function mergeModelFallbackConfig(partial?: Partial<ModelFallbackConfig> | null): ModelFallbackConfig {
  const triggersIn = partial?.triggers;
  const breakerIn = partial?.circuitBreaker;
  const chainsIn = partial?.chains;

  const merged: ModelFallbackConfig = {
    chains: {
      agentic: parseChain("agentic", chainsIn?.agentic),
      code: parseChain("code", chainsIn?.code),
      ask: parseChain("ask", chainsIn?.ask),
    },
    triggers: {
      http429: typeof triggersIn?.http429 === "boolean" ? triggersIn.http429 : DEFAULT_MODEL_FALLBACK.triggers.http429,
      timeoutMs: asPositiveInt(triggersIn?.timeoutMs, DEFAULT_MODEL_FALLBACK.triggers.timeoutMs),
      connectionRefused:
        typeof triggersIn?.connectionRefused === "boolean"
          ? triggersIn.connectionRefused
          : DEFAULT_MODEL_FALLBACK.triggers.connectionRefused,
    },
    circuitBreaker: {
      cooldownMs: asPositiveInt(
        breakerIn?.cooldownMs,
        DEFAULT_MODEL_FALLBACK.circuitBreaker.cooldownMs
      ),
      failureThreshold: Math.max(
        1,
        asPositiveInt(breakerIn?.failureThreshold, DEFAULT_MODEL_FALLBACK.circuitBreaker.failureThreshold)
      ),
    },
    maxRetriesPerProvider: Math.max(
      1,
      asPositiveInt(partial?.maxRetriesPerProvider, DEFAULT_MODEL_FALLBACK.maxRetriesPerProvider)
    ),
  };

  validateModelFallbackConfig(merged);
  return merged;
}

export function validateModelFallbackConfig(config: ModelFallbackConfig): void {
  if (config.triggers.timeoutMs < 1_000) {
    throw new FallbackChainConfigError(
      "models.fallback.triggers.timeoutMs must be at least 1000."
    );
  }
  if (config.circuitBreaker.cooldownMs < 0) {
    throw new FallbackChainConfigError("models.fallback.circuitBreaker.cooldownMs must be >= 0.");
  }
  if (config.circuitBreaker.failureThreshold < 1) {
    throw new FallbackChainConfigError(
      "models.fallback.circuitBreaker.failureThreshold must be >= 1."
    );
  }
  for (const mode of FALLBACK_CHAIN_MODES) {
    parseChain(mode, config.chains[mode]);
  }
}

export function getFallbackChainForMode(
  config: ModelFallbackConfig,
  mode: string
): AiProviderId[] {
  if (mode === "agentic" || mode === "code" || mode === "ask") {
    return config.chains[mode];
  }
  return config.chains.ask;
}
