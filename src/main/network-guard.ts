/**
 * Lot C1 — SSRF hardening for main-process outbound HTTP.
 *
 * Rules (outbound free URLs from renderer / LLM):
 * - https only (no http/file/ftp/data/javascript)
 * - configurable host allowlist
 * - DNS resolve before request; reject loopback / link-local / RFC1918 / metadata IPs
 * - revalidate every redirect (max 3); same scheme/host/IP rules
 * - mandatory timeout + max response size
 *
 * Local CAD exception (documented):
 * - `cad.apiUrl` / CAD base URL may be `http://127.0.0.1` or `http://localhost`
 *   when CAD_CLOUD_ONLY=0 (local mode). That path is allowlisted separately.
 * - Renderer-supplied STL URLs may use that same CAD base origin (incl. http loopback)
 *   only when it exactly matches the validated CAD base — never arbitrary http.
 */

import dns from "node:dns/promises";
import net from "node:net";
import { redactSensitiveText } from "../shared/command-output-redaction";
import { DEFAULT_CAD_CLOUD_URL, isCadCloudOnly } from "./cad-config";
import { IPC_CONTENT_LIMITS } from "./path-security";

export const NETWORK_GUARD_DEFAULTS = {
  TIMEOUT_MS: 25_000,
  MAX_REDIRECTS: 3,
  STL_MAX_BYTES: IPC_CONTENT_LIMITS.STL_BYTES,
  JSON_MAX_BYTES: 8 * 1024 * 1024,
  CDN_MAX_BYTES: 25 * 1024 * 1024,
} as const;

/** Hosts trusted for CAD API + artifact fetches (suffix match allowed). */
export const DEFAULT_CAD_ALLOWED_HOSTS = [
  hostnameOf(DEFAULT_CAD_CLOUD_URL) || "c-a-v-a-l-studio-production.up.railway.app",
  "up.railway.app",
  "supabase.co",
  "meshy.ai",
  "assets.meshy.ai",
  "api.meshy.ai",
] as const;

/** Hosts trusted for robotics CDN base (suffix match). */
export const DEFAULT_CDN_ALLOWED_HOSTS = ["cdn.jsdelivr.net", "jsdelivr.net", "github.com", "raw.githubusercontent.com"] as const;

/** Content types accepted for STL downloads. Missing/empty type is allowed (many CDNs omit it). */
export const STL_CONTENT_TYPES = [
  "model/stl",
  "application/sla",
  "application/vnd.ms-pki.stl",
  "application/octet-stream",
  "application/octetstream",
] as const;

export type NetworkBlockReason =
  | "scheme"
  | "host"
  | "credentials"
  | "private_ip"
  | "dns"
  | "redirect"
  | "redirect_limit"
  | "timeout"
  | "size"
  | "content_type"
  | "invalid_url";

export class NetworkGuardError extends Error {
  readonly reason: NetworkBlockReason;
  readonly url: string;

  constructor(reason: NetworkBlockReason, message: string, url = "") {
    super(message);
    this.name = "NetworkGuardError";
    this.reason = reason;
    this.url = url;
  }
}

export type UrlGuardMode =
  /** Free renderer/LLM URL — https + allowlist + public IP only. */
  | "outbound"
  /** STL/artifact URL — same as outbound, OR same-origin as validated CAD base (local http ok). */
  | "cad-artifact"
  /** CAD base URL from settings/env — https allowlist, or http loopback when local mode. */
  | "cad-base"
  /** Robotics CDN base / fetch — https + CDN allowlist. */
  | "cdn"
  /**
   * Extension registry (Lot C2): https + allowlist, OR http loopback same-origin
   * as marketplaceBaseUrl (local CAVALLO marketplace only).
   */
  | "marketplace"
  /**
   * Lot C3 MCP tool egress: https to any public host; DNS + private IP blocked;
   * no static host allowlist (fetch/firecrawl may target arbitrary public URLs).
   */
  | "public-https";

export type NetworkGuardLookup = (hostname: string) => Promise<string[]>;

export type AssertSafeUrlOptions = {
  mode: UrlGuardMode;
  allowedHosts?: string[];
  /** Validated CAD base URL (for cad-artifact same-origin + local http exception). */
  cadBaseUrl?: string | null;
  /** Local CAVALLO marketplace base (Lot C2) — http loopback same-origin only. */
  marketplaceBaseUrl?: string | null;
  /** Injected DNS for tests. */
  lookup?: NetworkGuardLookup;
  /** When true, skip DNS (scheme/host only) — used for sync boot checks. */
  skipDns?: boolean;
};

export type SafeFetchOptions = AssertSafeUrlOptions & {
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit | null;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  allowedContentTypes?: readonly string[] | null;
  /** Attach these headers ONLY when request origin matches trustedCadOrigin. */
  trustedCadOrigin?: string | null;
  cadAuthHeaders?: Record<string, string>;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
};

export type SafeFetchResult = {
  ok: boolean;
  status: number;
  headers: Headers;
  url: string;
  buffer: Buffer;
  contentType: string | null;
};

function hostnameOf(raw: string): string {
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function parseAllowedHostsEnv(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;\s]+/)
    .map((h) => h.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, ""))
    .filter(Boolean);
}

export function getCadAllowedHosts(): string[] {
  const fromEnv = parseAllowedHostsEnv(process.env.CAD_ALLOWED_HOSTS);
  const artifactEnv = parseAllowedHostsEnv(process.env.CAD_ARTIFACT_ALLOWED_HOSTS);
  const cadBaseHost = hostnameOf(process.env.CAD_API_URL ?? "");
  const hosts = new Set<string>([
    ...DEFAULT_CAD_ALLOWED_HOSTS,
    ...fromEnv,
    ...artifactEnv,
  ]);
  if (cadBaseHost) hosts.add(cadBaseHost);
  return [...hosts];
}

export function getCdnAllowedHosts(): string[] {
  const fromEnv = parseAllowedHostsEnv(process.env.ROBOTICS_CDN_ALLOWED_HOSTS);
  return [...new Set([...DEFAULT_CDN_ALLOWED_HOSTS, ...fromEnv])];
}

export function hostMatchesAllowlist(hostname: string, allowedHosts: string[]): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return false;
  return allowedHosts.some((entry) => {
    const allowed = entry.toLowerCase().replace(/\.$/, "");
    if (!allowed) return false;
    return host === allowed || host.endsWith(`.${allowed}`);
  });
}

/** True for loopback / link-local / RFC1918 / ULA / cloud metadata. */
export function isBlockedIpAddress(ip: string): boolean {
  const raw = ip.trim().toLowerCase();
  if (!raw) return true;

  if (net.isIP(raw) === 4) {
    const parts = raw.split(".").map((p) => Number(p));
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
      return true;
    }
    const [a, b] = parts;
    // Loopback 127.0.0.0/8
    if (a === 127) return true;
    // RFC1918
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    // Link-local / AWS metadata 169.254.0.0/16
    if (a === 169 && b === 254) return true;
    // CGNAT / shared 100.64.0.0/10
    if (a === 100 && b >= 64 && b <= 127) return true;
    // 0.0.0.0/8
    if (a === 0) return true;
    return false;
  }

  if (net.isIP(raw) === 6) {
    // ::1 loopback
    if (raw === "::1" || raw === "0:0:0:0:0:0:0:1") return true;
    // IPv4-mapped
    if (raw.startsWith("::ffff:")) {
      return isBlockedIpAddress(raw.slice("::ffff:".length));
    }
    // fe80::/10 link-local
    if (/^fe[89ab][0-9a-f]:/i.test(raw)) return true;
    // fc00::/7 ULA
    if (/^f[cd][0-9a-f]{2}:/i.test(raw)) return true;
    // :: (unspecified)
    if (raw === "::" || raw === "0:0:0:0:0:0:0:0") return true;
    return false;
  }

  return true;
}

function isLoopbackHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]";
}

function logBlockedFetch(reason: NetworkBlockReason, url: string, detail: string): void {
  const safeUrl = redactSensitiveText(url.replace(/([?&](?:token|key|signature|sig)=)[^&]*/gi, "$1[REDACTED]"));
  console.warn(
    `[network-guard] blocked fetch reason=${reason} url=${safeUrl} detail=${redactSensitiveText(detail)}`
  );
}

export function throwBlocked(
  reason: NetworkBlockReason,
  message: string,
  url: string
): never {
  logBlockedFetch(reason, url, message);
  throw new NetworkGuardError(reason, message, url);
}

async function defaultLookup(hostname: string): Promise<string[]> {
  // Prefer literal IP hostnames without DNS.
  if (net.isIP(hostname)) return [hostname];
  const results = await dns.lookup(hostname, { all: true, verbatim: true });
  return results.map((r) => r.address);
}

function resolveAllowedHosts(mode: UrlGuardMode, override?: string[]): string[] {
  if (override && override.length > 0) return override.map((h) => h.toLowerCase());
  if (mode === "cdn") return getCdnAllowedHosts();
  // marketplace / outbound without override must pass allowedHosts explicitly from callers.
  if (mode === "marketplace") return [];
  // public-https: no host allowlist — any public host after DNS/IP checks.
  if (mode === "public-https") return [];
  return getCadAllowedHosts();
}

function isLocalCadBaseAllowed(): boolean {
  return !isCadCloudOnly() || process.env.CAD_ALLOW_LOCAL_HTTP === "1";
}

function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

/**
 * Validate URL before any outbound request.
 * Does not attach secrets — callers decide headers after validation.
 */
export async function assertSafeOutboundUrl(
  rawUrl: string,
  options: AssertSafeUrlOptions
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throwBlocked("invalid_url", "Invalid URL", rawUrl);
  }

  if (parsed.username || parsed.password) {
    throwBlocked("credentials", "URLs with embedded credentials are blocked", rawUrl);
  }

  const protocol = parsed.protocol.toLowerCase();
  const host = parsed.hostname.toLowerCase();
  const allowedHosts = resolveAllowedHosts(options.mode, options.allowedHosts);

  const cadBase = options.cadBaseUrl?.trim() || process.env.CAD_API_URL?.trim() || "";
  const matchesCadBase = Boolean(cadBase && sameOrigin(rawUrl, cadBase));
  const marketplaceBase = options.marketplaceBaseUrl?.trim() || "";
  const matchesMarketplaceBase = Boolean(marketplaceBase && sameOrigin(rawUrl, marketplaceBase));

  // Local CAD base exception (settings + artifact same-origin only).
  const localCadHttpOk =
    protocol === "http:" &&
    isLoopbackHostname(host) &&
    isLocalCadBaseAllowed() &&
    (options.mode === "cad-base" || (options.mode === "cad-artifact" && matchesCadBase));

  // Local CAVALLO marketplace exception (Lot C2) — http loopback, same-origin only.
  const localMarketplaceHttpOk =
    protocol === "http:" &&
    isLoopbackHostname(host) &&
    options.mode === "marketplace" &&
    matchesMarketplaceBase;

  const localHttpOk = localCadHttpOk || localMarketplaceHttpOk;

  if (protocol === "http:") {
    if (!localHttpOk) {
      throwBlocked(
        "scheme",
        "Only https URLs are allowed (http reserved for allowlisted local CAD/marketplace base)",
        rawUrl
      );
    }
  } else if (protocol !== "https:") {
    throwBlocked("scheme", `Blocked URL scheme: ${protocol}`, rawUrl);
  }

  if ((options.mode === "cad-base" && localCadHttpOk) || localMarketplaceHttpOk) {
    // Loopback CAD / marketplace base — skip public allowlist; still reject non-loopback http above.
    if (!options.skipDns) {
      const lookup = options.lookup ?? defaultLookup;
      let addresses: string[];
      try {
        addresses = await lookup(host);
      } catch (err) {
        throwBlocked("dns", err instanceof Error ? err.message : "DNS lookup failed", rawUrl);
      }
      if (!addresses.length) throwBlocked("dns", "DNS returned no addresses", rawUrl);
      for (const ip of addresses) {
        // For local CAD/marketplace base, ONLY loopback IPs are acceptable.
        if (!(ip === "127.0.0.1" || ip === "::1" || ip.startsWith("127."))) {
          throwBlocked("private_ip", `Local base resolved to non-loopback IP ${ip}`, rawUrl);
        }
      }
    }
    return parsed;
  }

  if (options.mode === "cad-artifact" && matchesCadBase && localCadHttpOk) {
    return parsed;
  }

  // Lot C3: MCP tool URLs — any public https host; skip allowlist; still DNS + private IP.
  if (options.mode === "public-https") {
    if (protocol !== "https:") {
      throwBlocked("scheme", "MCP tool URLs require https", rawUrl);
    }
    if (net.isIP(host) && isBlockedIpAddress(host)) {
      throwBlocked("private_ip", `Blocked private/metadata IP host: ${host}`, rawUrl);
    }
    if (!options.skipDns) {
      const lookup = options.lookup ?? defaultLookup;
      let addresses: string[];
      try {
        addresses = await lookup(host);
      } catch (err) {
        throwBlocked("dns", err instanceof Error ? err.message : "DNS lookup failed", rawUrl);
      }
      if (!addresses.length) throwBlocked("dns", "DNS returned no addresses", rawUrl);
      for (const ip of addresses) {
        if (isBlockedIpAddress(ip)) {
          throwBlocked("private_ip", `Host resolved to blocked IP ${ip}`, rawUrl);
        }
      }
    }
    return parsed;
  }

  if (!hostMatchesAllowlist(host, allowedHosts)) {
    throwBlocked("host", `Host not on allowlist: ${host}`, rawUrl);
  }

  // Literal hostname that is a private IP (e.g. https://10.0.0.5/) — reject even if somehow allowlisted.
  if (net.isIP(host) && isBlockedIpAddress(host)) {
    throwBlocked("private_ip", `Blocked private/metadata IP host: ${host}`, rawUrl);
  }

  if (!options.skipDns) {
    const lookup = options.lookup ?? defaultLookup;
    let addresses: string[];
    try {
      addresses = await lookup(host);
    } catch (err) {
      throwBlocked("dns", err instanceof Error ? err.message : "DNS lookup failed", rawUrl);
    }
    if (!addresses.length) throwBlocked("dns", "DNS returned no addresses", rawUrl);
    for (const ip of addresses) {
      if (isBlockedIpAddress(ip)) {
        throwBlocked("private_ip", `Resolved to blocked IP ${ip}`, rawUrl);
      }
    }
  }

  return parsed;
}

/** Sync scheme/host check for boot / settings preview (no DNS). */
export function assertSafeOutboundUrlSync(
  rawUrl: string,
  options: Omit<AssertSafeUrlOptions, "lookup" | "skipDns">
): URL {
  // Re-use async path with skipDns via deasync is unavailable — inline sync subset.
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throwBlocked("invalid_url", "Invalid URL", rawUrl);
  }
  if (parsed.username || parsed.password) {
    throwBlocked("credentials", "URLs with embedded credentials are blocked", rawUrl);
  }
  const protocol = parsed.protocol.toLowerCase();
  const host = parsed.hostname.toLowerCase();
  const allowedHosts = resolveAllowedHosts(options.mode, options.allowedHosts);
  const cadBase = options.cadBaseUrl?.trim() || process.env.CAD_API_URL?.trim() || "";
  const matchesCadBase = Boolean(cadBase && sameOrigin(rawUrl, cadBase));
  const marketplaceBase = options.marketplaceBaseUrl?.trim() || "";
  const matchesMarketplaceBase = Boolean(marketplaceBase && sameOrigin(rawUrl, marketplaceBase));
  const localCadHttpOk =
    protocol === "http:" &&
    isLoopbackHostname(host) &&
    isLocalCadBaseAllowed() &&
    (options.mode === "cad-base" || (options.mode === "cad-artifact" && matchesCadBase));
  const localMarketplaceHttpOk =
    protocol === "http:" &&
    isLoopbackHostname(host) &&
    options.mode === "marketplace" &&
    matchesMarketplaceBase;
  const localHttpOk = localCadHttpOk || localMarketplaceHttpOk;

  if (protocol === "http:") {
    if (!localHttpOk) {
      throwBlocked(
        "scheme",
        "Only https URLs are allowed (http reserved for allowlisted local CAD/marketplace base)",
        rawUrl
      );
    }
    return parsed;
  }
  if (protocol !== "https:") {
    throwBlocked("scheme", `Blocked URL scheme: ${protocol}`, rawUrl);
  }
  if (net.isIP(host) && isBlockedIpAddress(host)) {
    throwBlocked("private_ip", `Blocked private/metadata IP host: ${host}`, rawUrl);
  }
  if (options.mode === "public-https") {
    return parsed;
  }
  if (
    !hostMatchesAllowlist(host, allowedHosts) &&
    !(options.mode === "cad-artifact" && matchesCadBase) &&
    !(options.mode === "marketplace" && matchesMarketplaceBase)
  ) {
    throwBlocked("host", `Host not on allowlist: ${host}`, rawUrl);
  }
  return parsed;
}

/**
 * Validate + normalize CAD API base URL from settings / env.
 * Local mode: http://127.0.0.1[:port] / http://localhost[:port] allowed.
 * Cloud-only: https + CAD allowlist only.
 */
export async function validateCadApiUrl(
  raw: string,
  opts?: { lookup?: NetworkGuardLookup; skipDns?: boolean }
): Promise<{ ok: true; normalized: string } | { ok: false; error: string; reason: NetworkBlockReason }> {
  let url = raw.trim().replace(/\/+$/, "");
  if (!url) return { ok: false, error: "CAD API URL is empty", reason: "invalid_url" };
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  try {
    const parsed = await assertSafeOutboundUrl(url, {
      mode: "cad-base",
      lookup: opts?.lookup,
      skipDns: opts?.skipDns,
    });
    return { ok: true, normalized: parsed.origin + parsed.pathname.replace(/\/+$/, "") };
  } catch (err) {
    if (err instanceof NetworkGuardError) {
      return { ok: false, error: err.message, reason: err.reason };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      reason: "invalid_url",
    };
  }
}

export function validateCadApiUrlSync(
  raw: string
): { ok: true; normalized: string } | { ok: false; error: string; reason: NetworkBlockReason } {
  let url = raw.trim().replace(/\/+$/, "");
  if (!url) return { ok: false, error: "CAD API URL is empty", reason: "invalid_url" };
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  try {
    const parsed = assertSafeOutboundUrlSync(url, { mode: "cad-base" });
    return { ok: true, normalized: parsed.origin + parsed.pathname.replace(/\/+$/, "") };
  } catch (err) {
    if (err instanceof NetworkGuardError) {
      return { ok: false, error: err.message, reason: err.reason };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      reason: "invalid_url",
    };
  }
}

export function validateRoboticsCdnBase(
  raw: string
): { ok: true; normalized: string } | { ok: false; error: string } {
  const url = raw.trim().replace(/\/+$/, "");
  try {
    const parsed = assertSafeOutboundUrlSync(url, { mode: "cdn" });
    return { ok: true, normalized: `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "") };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function readBodyWithLimit(
  res: Response,
  maxBytes: number,
  url: string
): Promise<Buffer> {
  const contentLength = res.headers.get("content-length");
  if (contentLength) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > maxBytes) {
      throwBlocked("size", `Response Content-Length ${declared} exceeds limit ${maxBytes}`, url);
    }
  }

  const body = res.body;
  if (!body || typeof body.getReader !== "function") {
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) {
      throwBlocked("size", `Response body ${buf.length} exceeds limit ${maxBytes}`, url);
    }
    return buf;
  }

  const reader = body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throwBlocked("size", `Response body exceeds limit ${maxBytes}`, url);
      }
      chunks.push(Buffer.from(value));
    }
  } catch (err) {
    if (err instanceof NetworkGuardError) throw err;
    throw err;
  }
  return Buffer.concat(chunks, total);
}

function contentTypeAllowed(
  contentType: string | null,
  allowed: readonly string[] | null | undefined
): boolean {
  if (!allowed || allowed.length === 0) return true;
  if (!contentType || !contentType.trim()) return true; // many STL endpoints omit type
  const base = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  return allowed.some((a) => a.toLowerCase() === base);
}

/**
 * Outbound fetch with SSRF controls, redirect revalidation, timeout, and size limit.
 * CAD auth headers are attached ONLY when request origin matches trustedCadOrigin.
 */
export async function safeFetch(
  rawUrl: string,
  options: SafeFetchOptions
): Promise<SafeFetchResult> {
  const timeoutMs = options.timeoutMs ?? NETWORK_GUARD_DEFAULTS.TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? NETWORK_GUARD_DEFAULTS.STL_MAX_BYTES;
  const maxRedirects = options.maxRedirects ?? NETWORK_GUARD_DEFAULTS.MAX_REDIRECTS;
  const fetchImpl = options.fetchImpl ?? fetch;

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener("abort", onAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let current = rawUrl;
  try {
    for (let hop = 0; hop <= maxRedirects; hop++) {
      await assertSafeOutboundUrl(current, options);

      const origin = new URL(current).origin;
      const headers: Record<string, string> = { ...(options.headers ?? {}) };
      // Secrets ONLY when destination origin matches trusted CAD base — never for free URLs.
      if (
        options.cadAuthHeaders &&
        options.trustedCadOrigin &&
        origin === new URL(options.trustedCadOrigin).origin
      ) {
        Object.assign(headers, options.cadAuthHeaders);
      }

      let res: Response;
      try {
        res = await fetchImpl(current, {
          method: options.method ?? "GET",
          headers,
          body: hop === 0 ? options.body : undefined,
          redirect: "manual",
          signal: controller.signal,
        });
      } catch (err) {
        if (controller.signal.aborted) {
          throwBlocked("timeout", `Request timed out after ${timeoutMs}ms`, current);
        }
        throw err;
      }

      if ([301, 302, 303, 307, 308].includes(res.status)) {
        if (hop >= maxRedirects) {
          throwBlocked(
            "redirect_limit",
            `Too many redirects (max ${maxRedirects})`,
            current
          );
        }
        const location = res.headers.get("location");
        if (!location?.trim()) {
          throwBlocked("redirect", "Redirect without Location header", current);
        }
        let next: string;
        try {
          next = new URL(location, current).href;
        } catch {
          throwBlocked("redirect", "Invalid redirect Location", current);
        }
        // Drain/cancel body before following.
        try {
          await res.arrayBuffer();
        } catch {
          /* ignore */
        }
        current = next;
        continue;
      }

      const contentType = res.headers.get("content-type");
      if (!contentTypeAllowed(contentType, options.allowedContentTypes)) {
        throwBlocked(
          "content_type",
          `Blocked Content-Type: ${contentType ?? "(missing)"}`,
          current
        );
      }

      const buffer = await readBodyWithLimit(res, maxBytes, current);
      return {
        ok: res.ok,
        status: res.status,
        headers: res.headers,
        url: current,
        buffer,
        contentType,
      };
    }
    return throwBlocked("redirect_limit", `Too many redirects (max ${maxRedirects})`, current);
  } finally {
    clearTimeout(timer);
    if (options.signal) options.signal.removeEventListener("abort", onAbort);
  }
}

/** Redact secrets from error strings returned to renderer. */
export function sanitizeNetworkError(error: unknown): string {
  const message =
    error instanceof NetworkGuardError
      ? `Blocked by network guard (${error.reason}): ${error.message}`
      : error instanceof Error
        ? error.message
        : String(error);
  return redactSensitiveText(message);
}
