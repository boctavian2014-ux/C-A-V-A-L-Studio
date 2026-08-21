/**
 * Pas 7f.1 — Unified AI provider registry contract (shared main ↔ renderer).
 * No API key values ever appear in these types.
 */

export const AI_PROVIDER_IDS = [
  "ollama",
  "openai",
  "anthropic",
  "gemini",
  "openrouter",
  "custom",
] as const;

export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];

/**
 * Unified status per provider.
 * Ollama-only: not-installed, model-missing (and starting/unavailable from lifecycle).
 * Cloud: configured | not-configured (starting/unavailable unused for cloud in 7f.1).
 */
export type ProviderStatus =
  | "configured"
  | "not-configured"
  | "starting"
  | "unavailable"
  | "not-installed"
  | "model-missing";

export interface AiProviderEntry {
  id: AiProviderId;
  /** Display label — Ollama uses "Local & Free". */
  label: string;
  description: string;
  status: ProviderStatus;
  /** False for custom stub (coming soon). */
  selectable: boolean;
  comingSoon?: boolean;
  /** Secret env key for Add API key (cloud only). */
  secretKey?: string;
  /** Extra status detail for UI (e.g. model name). */
  detail?: string;
}

export interface AiProvidersSnapshot {
  providers: AiProviderEntry[];
  /** Currently preferred provider id (from settings). */
  preferredProviderId: AiProviderId;
  /** True when Electron safeStorage encryption is unavailable. */
  encryptionAvailable: boolean;
}

export const AI_PREFERRED_PROVIDER_SETTING = "ai.preferredProvider";

export function isAiProviderId(value: unknown): value is AiProviderId {
  return typeof value === "string" && (AI_PROVIDER_IDS as readonly string[]).includes(value);
}

import type { LocalAiPhase } from "./local-ai-contract";
import { toProviderStatus } from "./local-ai-contract";

/** Input used to map Ollama local-ai status → ProviderStatus (no lifecycle rewrite). */
export interface OllamaStatusInput {
  installed: boolean;
  running: boolean;
  defaultModelReady: boolean;
  phase: LocalAiPhase | "running" | "starting" | "unavailable";
  inProgress?: boolean;
}

/**
 * Map existing LocalAiStatus fields to ProviderStatus.
 * Prefer authoritative LocalAiPhase when present (7f.2).
 */
export function mapOllamaToProviderStatus(input: OllamaStatusInput): ProviderStatus {
  if (
    input.phase === "ready" ||
    input.phase === "starting" ||
    input.phase === "unavailable" ||
    input.phase === "not-installed" ||
    input.phase === "model-missing"
  ) {
    return toProviderStatus({ phase: input.phase });
  }
  // Legacy 7f.1-era phase: "running"
  if (!input.installed) return "not-installed";
  if (input.inProgress) return "starting";
  if (input.running && !input.defaultModelReady) return "model-missing";
  if (input.running && input.defaultModelReady) return "configured";
  return "unavailable";
}

export function mapCloudKeyConfigured(configured: boolean): ProviderStatus {
  return configured ? "configured" : "not-configured";
}

export function statusLabel(status: ProviderStatus): string {
  switch (status) {
    case "configured":
      return "Ready";
    case "not-configured":
      return "Not configured";
    case "starting":
      return "Starting";
    case "unavailable":
      return "Unavailable";
    case "not-installed":
      return "Not installed";
    case "model-missing":
      return "Model missing";
    default:
      return status;
  }
}
