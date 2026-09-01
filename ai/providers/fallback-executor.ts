/**
 * Mode-aware provider fallback (NVIDIA NIM ↔ Ollama for code/ask; never Ollama for Agentic).
 */

import type { AiProviderId } from "../../src/shared/ai-provider-contract";
import { redactSensitiveText } from "../../src/shared/command-output-redaction";
import type { ModelFallbackConfig } from "../config/model-fallback-chain";
import { getFallbackChainForMode } from "../config/model-fallback-chain";
import {
  AGENTIC_NVIDIA_FALLBACK_PROFILE_ID,
  AGENTIC_NVIDIA_PRIMARY_PROFILE_ID,
  LOCAL_OFFLINE_PROFILE_ID,
} from "../models/nvidia-nim-catalog";
import { getModelProfile } from "../model-profiles";
import {
  ProviderCircuitBreaker,
  isCircuitTripError,
} from "./circuit-breaker";
import { SafeProviderError } from "./provider-errors";
import { isOllamaEligibleForFallback } from "./ollama-health";

export const AGENTIC_PROVIDER_UNAVAILABLE = "AGENTIC_PROVIDER_UNAVAILABLE";

export type FallbackTriggerReason = "http429" | "timeout" | "connectionRefused" | "circuit_open";

export interface FallbackSwitchLog {
  fromProvider: string;
  toProvider: string | null;
  reason: FallbackTriggerReason;
}

export class AgenticProviderUnavailableError extends Error {
  readonly code = AGENTIC_PROVIDER_UNAVAILABLE;
  readonly providerId: string;
  readonly cooldownRemainingMs: number;

  constructor(providerId: string, cooldownRemainingMs: number) {
    super(
      `Agentic provider ${providerId} is unavailable` +
        (cooldownRemainingMs > 0 ? ` (retry in ${Math.ceil(cooldownRemainingMs / 1000)}s)` : "") +
        ". Ollama is not used for Agentic fallback."
    );
    this.name = "AgenticProviderUnavailableError";
    this.providerId = providerId;
    this.cooldownRemainingMs = cooldownRemainingMs;
  }
}

export function isAgenticProviderUnavailableError(
  error: unknown
): error is AgenticProviderUnavailableError {
  return (
    error instanceof AgenticProviderUnavailableError ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === AGENTIC_PROVIDER_UNAVAILABLE)
  );
}

export function profileProviderToRegistryId(provider: string | undefined): AiProviderId | null {
  if (provider === "open_source") return "ollama";
  if (
    provider === "nvidia" ||
    provider === "openrouter" ||
    provider === "openai" ||
    provider === "anthropic" ||
    provider === "gemini" ||
    provider === "custom" ||
    provider === "ollama"
  ) {
    return provider;
  }
  return null;
}

export function modelIdsForRegistryProvider(providerId: AiProviderId): string[] {
  switch (providerId) {
    case "nvidia":
      return [AGENTIC_NVIDIA_PRIMARY_PROFILE_ID, AGENTIC_NVIDIA_FALLBACK_PROFILE_ID];
    case "ollama":
      return [LOCAL_OFFLINE_PROFILE_ID];
    case "openrouter":
      return ["stepfun-step-3-7-flash", "nex-n2-pro"];
    default:
      return [];
  }
}

export function classifyFallbackTrigger(
  error: unknown,
  config: ModelFallbackConfig
): FallbackTriggerReason | null {
  if (error instanceof SafeProviderError) {
    if (error.code === "rate_limited" && config.triggers.http429) return "http429";
    if (error.code === "request_timeout" && config.triggers.timeoutMs > 0) return "timeout";
    if (error.code === "provider_unavailable" && config.triggers.connectionRefused) {
      return "connectionRefused";
    }
  }
  const message = error instanceof Error ? error.message : String(error);
  if (config.triggers.http429 && /429|rate[_ ]?limit/i.test(message)) return "http429";
  if (config.triggers.timeoutMs > 0 && /timeout|ETIMEDOUT|aborted/i.test(message)) return "timeout";
  if (config.triggers.connectionRefused && /ECONNREFUSED|ECONNRESET|ENOTFOUND|fetch failed/i.test(message)) {
    return "connectionRefused";
  }
  return null;
}

export function logFallbackSwitch(entry: FallbackSwitchLog): void {
  const safe = {
    fromProvider: entry.fromProvider,
    toProvider: entry.toProvider,
    reason: entry.reason,
  };
  console.info("[fallback]", redactSensitiveText(JSON.stringify(safe)));
}

export async function resolveRuntimeFallbackChain(input: {
  mode: string;
  config: ModelFallbackConfig;
  isOllamaHealthy?: () => Promise<boolean>;
}): Promise<AiProviderId[]> {
  let chain = [...getFallbackChainForMode(input.config, input.mode)];
  if (input.mode === "agentic") {
    chain = chain.filter((id) => id !== "ollama");
  }
  const ollamaOk = input.isOllamaHealthy
    ? await input.isOllamaHealthy()
    : await isOllamaEligibleForFallback();
  if (!ollamaOk) {
    chain = chain.filter((id) => id !== "ollama");
  }
  return chain;
}

export function retryAfterMsFromError(error: unknown): number | undefined {
  if (error instanceof SafeProviderError && error.retryAfterMs && error.retryAfterMs > 0) {
    return error.retryAfterMs;
  }
  return undefined;
}

export interface FallbackStepResult<T> {
  ok: true;
  value: T;
  providerId: AiProviderId;
  fallbackFrom?: AiProviderId;
  fallbackReason?: FallbackTriggerReason;
}

export async function executeModeAwareFallback<T>(opts: {
  mode: string;
  config: ModelFallbackConfig;
  breaker: ProviderCircuitBreaker;
  execute: (providerId: AiProviderId) => Promise<T>;
  isOllamaHealthy?: () => Promise<boolean>;
  log?: (entry: FallbackSwitchLog) => void;
}): Promise<FallbackStepResult<T>> {
  const chain = await resolveRuntimeFallbackChain({
    mode: opts.mode,
    config: opts.config,
    isOllamaHealthy: opts.isOllamaHealthy,
  });
  const log = opts.log ?? logFallbackSwitch;
  const tried = new Set<AiProviderId>();
  let previous: AiProviderId | undefined;
  let lastTrigger: FallbackTriggerReason | null = null;
  let lastError: unknown;
  let lastProvider: AiProviderId | undefined;

  const maxPer = Math.max(1, opts.config.maxRetriesPerProvider);

  for (const providerId of chain) {
    if (tried.has(providerId)) continue;
    if (!opts.breaker.allowRequest(providerId)) {
      lastTrigger = "circuit_open";
      lastProvider = providerId;
      continue;
    }

    let attempts = 0;
    while (attempts < maxPer) {
      attempts += 1;
      tried.add(providerId);
      try {
        const value = await opts.execute(providerId);
        opts.breaker.recordSuccess(providerId);
        return {
          ok: true,
          value,
          providerId,
          fallbackFrom: previous,
          fallbackReason: previous ? lastTrigger ?? undefined : undefined,
        };
      } catch (error) {
        lastError = error;
        lastProvider = providerId;
        if (isCircuitTripError(error)) {
          opts.breaker.recordFailure(providerId, { retryAfterMs: retryAfterMsFromError(error) });
        }
        lastTrigger = classifyFallbackTrigger(error, opts.config);
        break;
      }
    }

    const remaining = chain.filter((id) => !tried.has(id));
    const next = remaining[0];
    if (opts.mode === "agentic") {
      const nextCloud = remaining.find((id) => id !== "ollama");
      if (!nextCloud) {
        throw new AgenticProviderUnavailableError(
          providerId,
          opts.breaker.getCooldownRemainingMs(providerId)
        );
      }
    }

    if (!lastTrigger) {
      throw lastError instanceof Error ? lastError : new Error(String(lastError));
    }

    if (next && !(opts.mode === "agentic" && next === "ollama")) {
      log({
        fromProvider: providerId,
        toProvider: next,
        reason: lastTrigger,
      });
      previous = providerId;
      continue;
    }

    break;
  }

  if (opts.mode === "agentic") {
    throw new AgenticProviderUnavailableError(
      lastProvider ?? chain[0] ?? "nvidia",
      opts.breaker.getCooldownRemainingMs(lastProvider ?? chain[0] ?? "nvidia")
    );
  }

  const message = lastError instanceof Error ? lastError.message : "All providers in the fallback chain failed";
  throw new Error(redactSensitiveText(message));
}

export function toUnavailableUiError(error: AgenticProviderUnavailableError): {
  ok: false;
  error: string;
  code: typeof AGENTIC_PROVIDER_UNAVAILABLE;
  providerId: string;
  cooldownRemainingMs: number;
} {
  return {
    ok: false,
    error: error.message,
    code: AGENTIC_PROVIDER_UNAVAILABLE,
    providerId: error.providerId,
    cooldownRemainingMs: error.cooldownRemainingMs,
  };
}

export function registryIdForModelId(modelId: string): AiProviderId | null {
  const profile = getModelProfile(modelId);
  return profileProviderToRegistryId(profile?.provider);
}
