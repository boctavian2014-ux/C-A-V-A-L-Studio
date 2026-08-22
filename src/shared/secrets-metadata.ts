/** Renderer-safe secret presence metadata — never includes values, prefixes, suffixes, or lengths. */

export type SecretSource = "environment" | "secure-storage" | "none";

export interface SecretProviderMetadata {
  provider: string;
  configured: boolean;
  source: SecretSource;
  lastValidatedAt: string | null;
}

export const SECRET_PROVIDER_IDS = [
  "OPENROUTER_API_KEY",
  "POOLSIDE_API_KEY",
  "NORTH_API_KEY",
  "NVIDIA_API_KEY",
  "MESHY_API_KEY",
  "PIAPI_API_KEY",
  "TRELLIS_API_KEY",
  "CAD_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_API_KEY",
  "FIRECRAWL_API_KEY",
  "POSTGRES_CONNECTION_STRING",
  "GITHUB_PERSONAL_ACCESS_TOKEN",
  "SEMGREP_APP_TOKEN",
  "SUPABASE_SERVICE_ROLE_KEY",
  "BILLING_API_KEY",
  "CAVAL_CLOUD_API_KEY",
  "CUSTOM_PROVIDER_BASE_URL",
  "CUSTOM_PROVIDER_API_KEY",
  "CUSTOM_PROVIDER_MODEL_ID",
  "CUSTOM_PROVIDER_LABEL",
] as const;

export type SecretProviderId = (typeof SECRET_PROVIDER_IDS)[number];

/** Keys that must never be accepted via settings-save from the renderer. */
export const SETTINGS_FORBIDDEN_SECRET_KEYS = [
  "openrouter.apiKey",
  "caval.cloud.apiKey",
  "cad.apiKey",
  "mesh.apiKey",
] as const;

const SECRET_FIELD_NAME_RE =
  /^(api[_-]?key|token|secret|authorization|password|openrouter.*key|meshy.*key|mesh.*key|piapi.*key|trellis.*key)$/i;

/** True when an object key name looks like a secret field from the renderer. */
export function isForbiddenSecretFieldName(key: string): boolean {
  return SECRET_FIELD_NAME_RE.test(key.trim());
}

/**
 * Recursively find forbidden secret-looking fields in a plain object.
 * Returns the first matching path or null.
 */
export function findForbiddenSecretField(
  value: unknown,
  path = ""
): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findForbiddenSecretField(value[i], `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = path ? `${path}.${key}` : key;
    if (isForbiddenSecretFieldName(key)) return childPath;
    const hit = findForbiddenSecretField(child, childPath);
    if (hit) return hit;
  }
  return null;
}

export function buildSecretProviderMetadata(input: {
  stored: Record<string, string>;
  env?: NodeJS.ProcessEnv;
  lastValidatedAt?: string | null;
}): SecretProviderMetadata[] {
  const env = input.env ?? process.env;
  const lastValidatedAt = input.lastValidatedAt ?? null;
  return SECRET_PROVIDER_IDS.map((provider) => {
    const fromStorage = Boolean(input.stored[provider]?.trim());
    const fromEnv = Boolean(env[provider]?.trim());
    const configured = fromStorage || fromEnv;
    let source: SecretSource = "none";
    if (fromStorage) source = "secure-storage";
    else if (fromEnv) source = "environment";
    return { provider, configured, source, lastValidatedAt };
  });
}

export function configuredMapFromProviders(
  providers: SecretProviderMetadata[]
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const p of providers) out[p.provider] = p.configured;
  return out;
}
