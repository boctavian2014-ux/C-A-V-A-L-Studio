/**
 * Lot C5.3 — Declarative provider registry (fixed base URLs; renderer cannot override host).
 */
import { isAllowedCustomUrl } from "../shared/ai-provider-contract";

export type ProviderAuthPolicy = "bearer_env" | "none_local" | "billing_api_key";

export interface CloudProviderPolicy {
  providerId: string;
  /** Allowed hostname suffixes (exact or subdomain). */
  allowedHosts: string[];
  /** Fixed HTTPS base URL origin(s). Empty for multi-host catalogs resolved via allowedHosts. */
  fixedBaseUrls: string[];
  auth: ProviderAuthPolicy;
  apiKeyEnv?: string;
  timeoutMs: number;
  maxResponseBytes: number;
  /** Local-only exception (Ollama). */
  localLoopbackOnly?: boolean;
}

export const CLOUD_PROVIDER_REGISTRY: Record<string, CloudProviderPolicy> = {
  openrouter: {
    providerId: "openrouter",
    allowedHosts: ["openrouter.ai"],
    fixedBaseUrls: ["https://openrouter.ai"],
    auth: "bearer_env",
    apiKeyEnv: "OPENROUTER_API_KEY",
    timeoutMs: 120_000,
    maxResponseBytes: 8 * 1024 * 1024,
  },
  poolside: {
    providerId: "poolside",
    allowedHosts: ["poolside.ai", "api.poolside.ai"],
    fixedBaseUrls: ["https://api.poolside.ai"],
    auth: "bearer_env",
    apiKeyEnv: "POOLSIDE_API_KEY",
    timeoutMs: 120_000,
    maxResponseBytes: 8 * 1024 * 1024,
  },
  north: {
    providerId: "north",
    allowedHosts: ["north.ai", "api.north.ai"],
    fixedBaseUrls: ["https://api.north.ai"],
    auth: "bearer_env",
    apiKeyEnv: "NORTH_API_KEY",
    timeoutMs: 120_000,
    maxResponseBytes: 8 * 1024 * 1024,
  },
  nvidia: {
    providerId: "nvidia",
    allowedHosts: ["nvidia.com", "api.nvcf.nvidia.com", "integrate.api.nvidia.com"],
    fixedBaseUrls: ["https://integrate.api.nvidia.com"],
    auth: "bearer_env",
    apiKeyEnv: "NVIDIA_API_KEY",
    timeoutMs: 120_000,
    maxResponseBytes: 8 * 1024 * 1024,
  },
  anthropic: {
    providerId: "anthropic",
    allowedHosts: ["api.anthropic.com"],
    fixedBaseUrls: ["https://api.anthropic.com"],
    auth: "bearer_env",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    timeoutMs: 120_000,
    maxResponseBytes: 8 * 1024 * 1024,
  },
  openai: {
    providerId: "openai",
    allowedHosts: ["api.openai.com"],
    fixedBaseUrls: ["https://api.openai.com"],
    auth: "bearer_env",
    apiKeyEnv: "OPENAI_API_KEY",
    timeoutMs: 120_000,
    maxResponseBytes: 8 * 1024 * 1024,
  },
  google: {
    providerId: "google",
    allowedHosts: ["generativelanguage.googleapis.com"],
    fixedBaseUrls: ["https://generativelanguage.googleapis.com"],
    auth: "bearer_env",
    apiKeyEnv: "GOOGLE_API_KEY",
    timeoutMs: 120_000,
    maxResponseBytes: 8 * 1024 * 1024,
  },
  caval_cloud: {
    providerId: "caval_cloud",
    allowedHosts: ["caval.studio", "up.railway.app"],
    fixedBaseUrls: [],
    auth: "bearer_env",
    apiKeyEnv: "CAVAL_CLOUD_API_KEY",
    timeoutMs: 45_000,
    maxResponseBytes: 4 * 1024 * 1024,
  },
  billing: {
    providerId: "billing",
    allowedHosts: ["127.0.0.1", "localhost"],
    fixedBaseUrls: [],
    auth: "billing_api_key",
    timeoutMs: 30_000,
    maxResponseBytes: 1 * 1024 * 1024,
    localLoopbackOnly: true,
  },
  ollama: {
    providerId: "ollama",
    allowedHosts: ["127.0.0.1", "::1"],
    fixedBaseUrls: [],
    auth: "none_local",
    timeoutMs: 45_000,
    maxResponseBytes: 8 * 1024 * 1024,
    localLoopbackOnly: true,
  },
};

export function getProviderPolicy(providerId: string): CloudProviderPolicy | undefined {
  return CLOUD_PROVIDER_REGISTRY[providerId];
}

export function hostAllowedForProvider(providerId: string, hostname: string): boolean {
  const policy = getProviderPolicy(providerId);
  if (!policy) return false;
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return policy.allowedHosts.some(
    (allowed) => host === allowed.toLowerCase() || host.endsWith(`.${allowed.toLowerCase()}`)
  );
}

/**
 * Ollama: only http://127.0.0.1:<port> or http://[::1]:<port> — never localhost hostname,
 * never renderer-supplied alternate private IPs.
 */
export function assertOllamaBaseUrl(raw: string): { ok: true; normalized: string } | { ok: false; error: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: "Invalid Ollama URL" };
  }
  if (url.protocol !== "http:") {
    return { ok: false, error: "Ollama allows http loopback only" };
  }
  if (url.username || url.password) {
    return { ok: false, error: "Ollama URL must not include credentials" };
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const isLoopbackV4 = host === "127.0.0.1";
  const isLoopbackV6 = host === "::1" || host === "0:0:0:0:0:0:0:1";
  if (!isLoopbackV4 && !isLoopbackV6) {
    return { ok: false, error: "Ollama host must be 127.0.0.1 or ::1 (not localhost hostname)" };
  }
  const port = url.port ? Number(url.port) : 11434;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, error: "Ollama port invalid" };
  }
  const path = url.pathname.replace(/\/+$/, "") || "/api/chat";
  const normalized = isLoopbackV6
    ? `http://[::1]:${port}${path}`
    : `http://127.0.0.1:${port}${path}`;
  return { ok: true, normalized };
}

export function assertProviderRequestUrl(
  providerId: string,
  rawUrl: string
): { ok: true; url: URL } | { ok: false; error: string } {
  if (providerId === "ollama") {
    const ollama = assertOllamaBaseUrl(rawUrl);
    if (!ollama.ok) return ollama;
    return { ok: true, url: new URL(ollama.normalized) };
  }
  if (providerId === "custom") {
    if (!isAllowedCustomUrl(rawUrl)) {
      return { ok: false, error: "Custom endpoint must be localhost/loopback or https" };
    }
    try {
      return { ok: true, url: new URL(rawUrl.trim()) };
    } catch {
      return { ok: false, error: "Invalid provider URL" };
    }
  }
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, error: "Invalid provider URL" };
  }
  const policy = getProviderPolicy(providerId);
  if (!policy) return { ok: false, error: `Unknown provider: ${providerId}` };

  if (policy.localLoopbackOnly) {
    if (url.protocol !== "http:") return { ok: false, error: "Local provider requires http" };
    if (!hostAllowedForProvider(providerId, url.hostname)) {
      return { ok: false, error: "Local provider host not allowlisted" };
    }
    return { ok: true, url };
  }

  if (url.protocol !== "https:") {
    return { ok: false, error: "Cloud providers require https" };
  }
  if (url.username || url.password) {
    return { ok: false, error: "Provider URL must not include credentials" };
  }
  if (!hostAllowedForProvider(providerId, url.hostname)) {
    return { ok: false, error: `Host not allowlisted for ${providerId}` };
  }
  return { ok: true, url };
}
