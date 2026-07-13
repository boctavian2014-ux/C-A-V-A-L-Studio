import type { ApiKeys } from '../multi-model/provider';

/** BYOK store keys → env / secrets file keys */
export const BYOK_TO_SECRET: Record<keyof Pick<ApiKeys, 'anthropic' | 'openai' | 'google'>, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_API_KEY',
};

/** Provider secret keys saved via ApiKeysModal */
export const PROVIDER_SECRET_KEYS = [
  'OPENROUTER_API_KEY',
  'POOLSIDE_API_KEY',
  'NVIDIA_API_KEY',
  'NORTH_API_KEY',
  'MESHY_API_KEY',
] as const;

export type ProviderSecretKey = (typeof PROVIDER_SECRET_KEYS)[number];

const SECRET_TO_BYOK: Record<string, keyof ApiKeys> = Object.fromEntries(
  Object.entries(BYOK_TO_SECRET).map(([k, v]) => [v, k as keyof ApiKeys])
) as Record<string, keyof ApiKeys>;

/** Legacy lowercase keys written before mapping fix */
const LEGACY_BYOK_ALIASES: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_API_KEY',
};

/** Merge patch into existing; empty string removes a key. */
export function mergeSecrets(
  existing: Record<string, string>,
  patch: Record<string, string>
): Record<string, string> {
  const merged = { ...existing };
  for (const [key, value] of Object.entries(patch)) {
    const trimmed = value?.trim() ?? '';
    if (!trimmed) {
      delete merged[key];
    } else {
      merged[key] = trimmed;
    }
  }
  return merged;
}

/** Normalize legacy / mixed key names into canonical env keys. */
export function normalizeSecretsMap(secrets: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(secrets)) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const canonical = LEGACY_BYOK_ALIASES[key] ?? key;
    if (!out[canonical] || canonical === key) {
      out[canonical] = trimmed;
    }
  }
  return out;
}

export function apiKeysToSecrets(apiKeys: ApiKeys): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [byokKey, secretKey] of Object.entries(BYOK_TO_SECRET)) {
    const value = apiKeys[byokKey as keyof ApiKeys]?.trim();
    if (value) out[secretKey] = value;
  }
  if (apiKeys.ollamaModel?.trim()) out.OLLAMA_MODEL = apiKeys.ollamaModel.trim();
  if (apiKeys.ollamaBaseUrl?.trim()) out.OLLAMA_BASE_URL = apiKeys.ollamaBaseUrl.trim();
  return out;
}

export function secretsToApiKeys(secrets: Record<string, string>): ApiKeys {
  const normalized = normalizeSecretsMap(secrets);
  const apiKeys: ApiKeys = {};
  for (const [secretKey, byokKey] of Object.entries(SECRET_TO_BYOK)) {
    const value = normalized[secretKey]?.trim();
    if (value) apiKeys[byokKey] = value;
  }
  if (normalized.OLLAMA_MODEL) apiKeys.ollamaModel = normalized.OLLAMA_MODEL;
  if (normalized.OLLAMA_BASE_URL) apiKeys.ollamaBaseUrl = normalized.OLLAMA_BASE_URL;
  return apiKeys;
}

export function buildSecretsPatch(input: {
  openRouter?: string;
  providerSecrets?: Record<string, string>;
  apiKeys?: ApiKeys;
}): Record<string, string> {
  const patch: Record<string, string> = {};
  if (input.openRouter !== undefined) {
    patch.OPENROUTER_API_KEY = input.openRouter;
  }
  if (input.providerSecrets) {
    for (const [key, value] of Object.entries(input.providerSecrets)) {
      patch[key] = value;
    }
  }
  if (input.apiKeys) {
    for (const [byokKey, secretKey] of Object.entries(BYOK_TO_SECRET)) {
      patch[secretKey] = input.apiKeys[byokKey as keyof ApiKeys]?.trim() ?? '';
    }
  }
  return patch;
}
