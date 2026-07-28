import type { ApiKeys } from '../multi-model/provider';

/** Presence marker in the renderer — never a real API key; must not be written to disk. */
export const CONFIGURED_MARKER = '__configured__';

export function isConfiguredMarker(value: string | undefined | null): boolean {
  return (value?.trim() ?? '') === CONFIGURED_MARKER;
}

/** True when value is a real secret (non-empty and not the UI marker). */
export function isPersistableSecret(value: string | undefined | null): boolean {
  const trimmed = value?.trim() ?? '';
  return Boolean(trimmed) && trimmed !== CONFIGURED_MARKER;
}

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
  'PIAPI_API_KEY',
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
    if (!trimmed || trimmed === CONFIGURED_MARKER) {
      if (!trimmed) delete merged[key];
      // Marker values are ignored (never wipe, never write).
      continue;
    }
    merged[key] = trimmed;
  }
  return merged;
}

/** Normalize legacy / mixed key names into canonical env keys. */
export function normalizeSecretsMap(secrets: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(secrets)) {
    const trimmed = value?.trim();
    if (!trimmed || trimmed === CONFIGURED_MARKER) continue;
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
    if (isPersistableSecret(value)) out[secretKey] = value!;
  }
  if (isPersistableSecret(apiKeys.ollamaModel)) out.OLLAMA_MODEL = apiKeys.ollamaModel!.trim();
  if (isPersistableSecret(apiKeys.ollamaBaseUrl)) out.OLLAMA_BASE_URL = apiKeys.ollamaBaseUrl!.trim();
  return out;
}

export function secretsToApiKeys(secrets: Record<string, string>): ApiKeys {
  const normalized = normalizeSecretsMap(secrets);
  const apiKeys: ApiKeys = {};
  for (const [secretKey, byokKey] of Object.entries(SECRET_TO_BYOK)) {
    const value = normalized[secretKey]?.trim();
    if (isPersistableSecret(value)) apiKeys[byokKey] = value!;
  }
  if (normalized.OLLAMA_MODEL) apiKeys.ollamaModel = normalized.OLLAMA_MODEL;
  if (normalized.OLLAMA_BASE_URL) apiKeys.ollamaBaseUrl = normalized.OLLAMA_BASE_URL;
  return apiKeys;
}

/**
 * Resolve real BYOK keys from process.env (main process after applyStoredSecretsToEnv).
 * Used for chat/completion — never use renderer `__configured__` markers as Bearer tokens.
 */
export function resolveByokApiKeysFromEnv(
  env: NodeJS.ProcessEnv = process.env
): ApiKeys {
  const pick = (key: string): string | undefined => {
    const v = env[key]?.trim();
    return isPersistableSecret(v) ? v : undefined;
  };
  return {
    anthropic: pick('ANTHROPIC_API_KEY'),
    openai: pick('OPENAI_API_KEY'),
    google: pick('GOOGLE_API_KEY'),
  };
}

/** Merge preferred (may include markers) with env-backed real keys. */
export function resolveByokApiKeys(
  preferred?: ApiKeys | null,
  env: NodeJS.ProcessEnv = process.env
): ApiKeys {
  const fromEnv = resolveByokApiKeysFromEnv(env);
  const mergeField = (
    preferredVal: string | undefined,
    envVal: string | undefined
  ): string | undefined => {
    if (isPersistableSecret(preferredVal)) return preferredVal!.trim();
    return envVal;
  };
  return {
    anthropic: mergeField(preferred?.anthropic, fromEnv.anthropic),
    openai: mergeField(preferred?.openai, fromEnv.openai),
    google: mergeField(preferred?.google, fromEnv.google),
    ollamaModel: preferred?.ollamaModel,
    ollamaBaseUrl: preferred?.ollamaBaseUrl,
  };
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
      const value = input.apiKeys[byokKey as keyof ApiKeys]?.trim() ?? '';
      // Only include real keys; omit markers so filter/merge won't touch stored secrets.
      if (isPersistableSecret(value)) {
        patch[secretKey] = value;
      }
    }
  }
  return patch;
}

/**
 * Keep only non-empty secret values so empty drafts do not wipe stored keys.
 * Also drops `__configured__` markers so they never overwrite real keys on disk.
 */
export function filterNonEmptySecretsPatch(patch: Record<string, string>): {
  filtered: Record<string, string>;
  savedKeys: string[];
} {
  const filtered: Record<string, string> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!isPersistableSecret(value)) continue;
    filtered[key] = value.trim();
  }
  return { filtered, savedKeys: Object.keys(filtered) };
}
