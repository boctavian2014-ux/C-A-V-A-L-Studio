import type { AIModelConfig } from "./model-types";

const API_KEY_ENV_BY_PROVIDER: Record<string, string> = {
  poolside: "POOLSIDE_API_KEY",
  north: "NORTH_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  nvidia: "NVIDIA_API_KEY",
};

/** True when an HTTP provider has credentials (or does not require a key). */
export function hasProviderCredentials(provider: string): boolean {
  const envKey = API_KEY_ENV_BY_PROVIDER[provider];
  if (!envKey) return true;
  return Boolean(process.env[envKey]?.trim());
}

/** Skip background preload when cloud credentials are missing. */
export function canPreloadHttpModel(config: AIModelConfig): boolean {
  if (config.runtime !== "http") return true;
  return hasProviderCredentials(config.provider);
}

export function providerApiKeyEnv(provider: string): string | undefined {
  return API_KEY_ENV_BY_PROVIDER[provider];
}
