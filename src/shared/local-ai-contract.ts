/**
 * Pas 7f.2 — Canonical local AI (Ollama) contract.
 * Loopback-only; no remote endpoint overrides from renderer.
 */

import type { ProviderStatus } from "./ai-provider-contract";

export const OLLAMA_LOOPBACK_URL = "http://127.0.0.1:11434" as const;
export const OLLAMA_HOST = "127.0.0.1:11434" as const;
export const OLLAMA_CHAT_URL = `${OLLAMA_LOOPBACK_URL}/api/chat` as const;
export const OLLAMA_TAGS_URL = `${OLLAMA_LOOPBACK_URL}/api/tags` as const;

/** Bounded start/health retry (documented). */
export const OLLAMA_START_ATTEMPTS = 3;
export const OLLAMA_START_DELAYS_MS = [500, 1_000, 2_000] as const;
export const OLLAMA_HEALTH_TIMEOUT_MS = 1_500;

export type LocalAiPhase =
  | "ready"
  | "starting"
  | "unavailable"
  | "not-installed"
  | "model-missing";

/** Renderer-safe snapshot (no ChildProcess, no local binary paths). */
export interface LocalAiStatus {
  phase: LocalAiPhase;
  installed: boolean;
  reachable: boolean;
  managedByCaval: boolean;
  defaultModel: string;
  defaultModelReady: boolean;
  endpoint: typeof OLLAMA_LOOPBACK_URL;
  updatedAt: number;
  reason?: string;
  /** Extended fields kept for existing Settings / invoke consumers. */
  supported: boolean;
  platform: string;
  /** Alias of reachable (legacy). */
  running: boolean;
  /** Alias of endpoint (legacy). */
  configuredUrl: string;
  models: string[];
  inProgress: boolean;
  /** Alias of reason (legacy). */
  lastError?: string;
  policy: string;
}

export function getOllamaLoopbackUrl(): typeof OLLAMA_LOOPBACK_URL {
  return OLLAMA_LOOPBACK_URL;
}

export function getOllamaHost(): typeof OLLAMA_HOST {
  return OLLAMA_HOST;
}

export function isLocalAiPhase(value: unknown): value is LocalAiPhase {
  return (
    value === "ready" ||
    value === "starting" ||
    value === "unavailable" ||
    value === "not-installed" ||
    value === "model-missing"
  );
}

/** Map expressive Ollama phase → 7f.1 ProviderStatus. */
export function toProviderStatus(status: Pick<LocalAiStatus, "phase">): ProviderStatus {
  switch (status.phase) {
    case "ready":
      return "configured";
    case "starting":
      return "starting";
    case "not-installed":
      return "not-installed";
    case "model-missing":
      return "model-missing";
    case "unavailable":
      return "unavailable";
    default:
      return "unavailable";
  }
}

/** Material fingerprint for live push dedupe. */
export function localAiStatusFingerprint(
  status: Pick<
    LocalAiStatus,
    | "phase"
    | "installed"
    | "reachable"
    | "defaultModelReady"
    | "managedByCaval"
    | "reason"
  >
): string {
  return JSON.stringify({
    phase: status.phase,
    installed: status.installed,
    reachable: status.reachable,
    defaultModelReady: status.defaultModelReady,
    managedByCaval: status.managedByCaval,
    reason: status.reason ?? null,
  });
}

export function sanitizeLocalAiReason(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  const text = raw.trim();
  if (/not installed|was not found|nu este instalat/i.test(text)) {
    return "Ollama was not found";
  }
  if (/did not become ready|did not respond|timeout|timed out/i.test(text)) {
    return "Ollama did not respond in time";
  }
  if (/exited|spawn|EACCES|ENOENT/i.test(text)) {
    return "Ollama failed to start";
  }
  // Never forward raw stderr / absolute paths.
  if (text.length > 160 || /[\\/]/.test(text)) {
    return "Ollama is unavailable";
  }
  return text;
}
