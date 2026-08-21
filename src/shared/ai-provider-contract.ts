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
  /** False when provider cannot be selected (legacy; custom is selectable in 7f.4). */
  selectable: boolean;
  comingSoon?: boolean;
  /** Secret env key for Add API key (cloud only). */
  secretKey?: string;
  /** Extra status detail for UI (e.g. model name). */
  detail?: string;
  /** Custom provider needs base URL + model id. */
  requiresBaseUrl?: boolean;
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

/** Pas 7f.4 — Custom OpenAI-compatible endpoint. */

export const CUSTOM_PROVIDER_SECRET_KEYS = [
  "CUSTOM_PROVIDER_BASE_URL",
  "CUSTOM_PROVIDER_API_KEY",
  "CUSTOM_PROVIDER_MODEL_ID",
  "CUSTOM_PROVIDER_LABEL",
] as const;

export type CustomProviderSecretKey = (typeof CUSTOM_PROVIDER_SECRET_KEYS)[number];

export interface CustomProviderConfig {
  baseUrl: string;
  apiKey?: string;
  modelId: string;
  label: string;
}

/** Documented allowlist patterns (loopback). Validation uses URL parsing. */
export const CUSTOM_PROVIDER_URL_ALLOWLIST_PATTERNS = [
  /^https?:\/\/localhost(:\d+)?(\/|$)/i,
  /^https?:\/\/127\.0\.0\.1(:\d+)?(\/|$)/i,
  /^https?:\/\/\[::1\](:\d+)?(\/|$)/i,
];

export function isAllowedCustomUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    if (parsed.username || parsed.password) return false;
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    const isLoopback =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "0:0:0:0:0:0:0:1";
    if (isLoopback) return true;
    // Non-loopback must use https (no plaintext API keys on the wire).
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function getCustomProviderStatus(configured: {
  CUSTOM_PROVIDER_BASE_URL?: boolean;
  CUSTOM_PROVIDER_MODEL_ID?: boolean;
}): ProviderStatus {
  return configured.CUSTOM_PROVIDER_BASE_URL && configured.CUSTOM_PROVIDER_MODEL_ID
    ? "configured"
    : "not-configured";
}

export function normalizeCustomBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}
