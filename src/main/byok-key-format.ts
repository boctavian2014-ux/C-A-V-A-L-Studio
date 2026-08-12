/**
 * Lot C5.5 — Local format validation only (no network on save).
 */

export type ByokSecretKey =
  | "OPENROUTER_API_KEY"
  | "ANTHROPIC_API_KEY"
  | "OPENAI_API_KEY"
  | "GOOGLE_API_KEY"
  | "POOLSIDE_API_KEY"
  | "NVIDIA_API_KEY"
  | "NORTH_API_KEY"
  | "MESHY_API_KEY"
  | "PIAPI_API_KEY"
  | "OLLAMA_BASE_URL"
  | "OLLAMA_MODEL";

const FORMATTERS: Partial<Record<ByokSecretKey, RegExp>> = {
  OPENROUTER_API_KEY: /^sk-or-v1-[A-Za-z0-9_-]{16,}$/,
  ANTHROPIC_API_KEY: /^sk-ant-[A-Za-z0-9_-]{16,}$/,
  OPENAI_API_KEY: /^sk-[A-Za-z0-9_-]{16,}$/,
  GOOGLE_API_KEY: /^AIza[0-9A-Za-z_-]{20,}$/,
  POOLSIDE_API_KEY: /^[A-Za-z0-9_-]{16,}$/,
  NVIDIA_API_KEY: /^[A-Za-z0-9_-]{16,}$/,
  NORTH_API_KEY: /^[A-Za-z0-9_-]{16,}$/,
  MESHY_API_KEY: /^[A-Za-z0-9_-]{12,}$/,
  PIAPI_API_KEY: /^[A-Za-z0-9_-]{12,}$/,
  OLLAMA_MODEL: /^[A-Za-z0-9._:/-]{1,128}$/,
};

import { assertOllamaBaseUrl } from "./cloud-provider-registry";

export function validateSecretFormat(
  key: string,
  value: string
): { ok: true } | { ok: false; error: string } {
  const trimmed = value.trim();
  if (!trimmed) return { ok: false, error: "Empty secret" };

  if (key === "OLLAMA_BASE_URL") {
    const ollama = assertOllamaBaseUrl(trimmed);
    return ollama.ok ? { ok: true } : { ok: false, error: ollama.error };
  }

  const pattern = FORMATTERS[key as ByokSecretKey];
  if (!pattern) {
    // Unknown keys: require non-trivial length, no whitespace.
    if (/\s/.test(trimmed) || trimmed.length < 8) {
      return { ok: false, error: "Secret format invalid" };
    }
    return { ok: true };
  }
  if (!pattern.test(trimmed)) {
    return { ok: false, error: `Invalid format for ${key}` };
  }
  return { ok: true };
}

export function validateSecretsPatchFormats(
  patch: Record<string, string>
): { ok: true } | { ok: false; error: string; key?: string } {
  for (const [key, value] of Object.entries(patch)) {
    const trimmed = value?.trim() ?? "";
    if (!trimmed) continue; // empty = delete
    const result = validateSecretFormat(key, trimmed);
    if (!result.ok) return { ok: false, error: result.error, key };
  }
  return { ok: true };
}
