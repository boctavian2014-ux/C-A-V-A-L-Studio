import type { MarketplaceExtension } from "../../marketplace/api";
import { isVsCodeEngineCompatible } from "../extensions/vscode-engine";
import {
  EXTENSION_INSTALL_LIMITS,
  INTEGRITY_METADATA_MISSING_ERROR,
  getOpenVsxAllowedHosts,
  isValidSha256Hex,
} from "./extension-registry";
import {
  assertExpectedSha256,
  assertVsixSizeLimit,
  parseSha256Digest,
} from "./extension-install-secure";
import {
  NetworkGuardError,
  NETWORK_GUARD_DEFAULTS,
  safeFetch,
  sanitizeNetworkError,
  type NetworkGuardLookup,
  type SafeFetchOptions,
} from "./network-guard";

export const OPEN_VSX_API_BASE = "https://open-vsx.org/api";

export interface OpenVsxExtension {
  namespace: string;
  name: string;
  displayName?: string;
  description?: string;
  downloadCount?: number;
  averageRating?: number;
  reviewCount?: number;
  version?: string;
  files?: { download?: string; icon?: string; sha256?: string };
  engines?: { vscode?: string; caval?: string };
}

export interface OpenVsxLatestVersion extends OpenVsxExtension {
  version: string;
  files: { download: string; icon?: string; sha256?: string };
}

export type OpenVsxFetchDeps = {
  fetchImpl?: typeof fetch;
  lookup?: NetworkGuardLookup;
};

function openVsxFetchOptions(
  deps: OpenVsxFetchDeps,
  maxBytes: number
): SafeFetchOptions {
  return {
    mode: "outbound",
    allowedHosts: getOpenVsxAllowedHosts(),
    fetchImpl: deps.fetchImpl,
    lookup: deps.lookup,
    maxBytes,
    timeoutMs: NETWORK_GUARD_DEFAULTS.TIMEOUT_MS,
    maxRedirects: NETWORK_GUARD_DEFAULTS.MAX_REDIRECTS,
  };
}

function assertOpenVsxUrlHost(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`URL OpenVSX invalid: ${rawUrl}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`URL OpenVSX trebuie să fie https: ${rawUrl}`);
  }
  const host = parsed.hostname.toLowerCase();
  const allowed = getOpenVsxAllowedHosts();
  const ok = allowed.some((entry) => {
    const a = entry.toLowerCase();
    return host === a || host.endsWith(`.${a}`);
  });
  if (!ok) {
    throw new Error(`Host OpenVSX în afara allowlist-ului: ${host}`);
  }
  return parsed;
}

export function mapToMarketplaceExtension(entry: OpenVsxExtension): MarketplaceExtension {
  const now = new Date().toISOString();
  return {
    id: `${entry.namespace}.${entry.name}`,
    publisher: entry.namespace,
    name: entry.name,
    version: entry.version ?? "0.0.0",
    displayName: entry.displayName ?? entry.name,
    description: entry.description ?? "",
    categories: [],
    vscodeCompatible: true,
    cavalVerified: false,
    downloads: entry.downloadCount ?? 0,
    rating: entry.averageRating ?? 0,
    ratingCount: entry.reviewCount ?? 0,
    trendingScore: 0,
    featured: false,
    tags: [],
    iconUrl: entry.files?.icon,
    createdAt: now,
    updatedAt: now,
  };
}

export function isInstallableOpenVsxExtension(entry: OpenVsxExtension): boolean {
  const download = entry.files?.download?.trim();
  if (!download) return false;
  try {
    assertOpenVsxUrlHost(download);
  } catch {
    return false;
  }
  if (entry.engines?.vscode) {
    return isVsCodeEngineCompatible(entry.engines.vscode);
  }
  return true;
}

export async function getLatestOpenVsxVersion(
  namespace: string,
  name: string,
  deps: OpenVsxFetchDeps | typeof fetch = {}
): Promise<OpenVsxLatestVersion | null> {
  const fetchDeps: OpenVsxFetchDeps =
    typeof deps === "function" ? { fetchImpl: deps } : deps;
  const metaUrl = `${OPEN_VSX_API_BASE}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/latest`;
  assertOpenVsxUrlHost(metaUrl);

  const res = await safeFetch(metaUrl, openVsxFetchOptions(fetchDeps, EXTENSION_INSTALL_LIMITS.METADATA_MAX_BYTES));
  if (!res.ok) return null;

  let data: OpenVsxLatestVersion;
  try {
    data = JSON.parse(res.buffer.toString("utf8")) as OpenVsxLatestVersion;
  } catch {
    return null;
  }
  if (!data.files?.download?.trim()) return null;

  // Revalidate download (+ optional sha256 URL) before callers use them.
  assertOpenVsxUrlHost(data.files.download);
  if (data.files.sha256?.trim()) {
    assertOpenVsxUrlHost(data.files.sha256);
  }
  return data;
}

async function enrichWithEngines(
  entry: OpenVsxExtension,
  deps: OpenVsxFetchDeps
): Promise<OpenVsxExtension> {
  if (entry.engines?.vscode) return entry;
  const latest = await getLatestOpenVsxVersion(entry.namespace, entry.name, deps);
  if (!latest) return entry;
  return {
    ...entry,
    version: latest.version ?? entry.version,
    engines: latest.engines,
    files: {
      ...entry.files,
      download: latest.files.download,
      icon: latest.files.icon ?? entry.files?.icon,
      sha256: latest.files.sha256 ?? entry.files?.sha256,
    },
  };
}

export function sortExtensionsByRating(extensions: MarketplaceExtension[]): MarketplaceExtension[] {
  return [...extensions].sort((a, b) => {
    if (b.rating !== a.rating) return b.rating - a.rating;
    return b.downloads - a.downloads;
  });
}

async function processOpenVsxEntries(
  raw: OpenVsxExtension[],
  limit: number,
  deps: OpenVsxFetchDeps
): Promise<MarketplaceExtension[]> {
  const enriched = await Promise.all(raw.slice(0, limit).map((e) => enrichWithEngines(e, deps)));
  return sortExtensionsByRating(
    enriched.filter(isInstallableOpenVsxExtension).map(mapToMarketplaceExtension)
  );
}

export async function listPopularOpenVsx(
  limit = 30,
  deps: OpenVsxFetchDeps | typeof fetch = {}
): Promise<MarketplaceExtension[]> {
  const fetchDeps: OpenVsxFetchDeps =
    typeof deps === "function" ? { fetchImpl: deps } : deps;
  const params = new URLSearchParams({ size: String(Math.min(limit, 50)) });
  const url = `${OPEN_VSX_API_BASE}/-/search?${params}`;
  assertOpenVsxUrlHost(url);
  const res = await safeFetch(url, openVsxFetchOptions(fetchDeps, EXTENSION_INSTALL_LIMITS.METADATA_MAX_BYTES));
  if (!res.ok) {
    throw new Error(`Open VSX popular list failed (${res.status})`);
  }
  const body = JSON.parse(res.buffer.toString("utf8")) as { extensions?: OpenVsxExtension[] };
  return processOpenVsxEntries(body.extensions ?? [], limit, fetchDeps);
}

export async function searchOpenVsx(
  query: string,
  limit = 30,
  deps: OpenVsxFetchDeps | typeof fetch = {}
): Promise<MarketplaceExtension[]> {
  const q = query.trim();
  if (!q) return [];
  const fetchDeps: OpenVsxFetchDeps =
    typeof deps === "function" ? { fetchImpl: deps } : deps;

  const params = new URLSearchParams({ query: q, size: String(Math.min(limit, 50)) });
  const url = `${OPEN_VSX_API_BASE}/-/search?${params}`;
  assertOpenVsxUrlHost(url);
  const res = await safeFetch(url, openVsxFetchOptions(fetchDeps, EXTENSION_INSTALL_LIMITS.METADATA_MAX_BYTES));
  if (!res.ok) {
    throw new Error(`Open VSX search failed (${res.status})`);
  }
  const body = JSON.parse(res.buffer.toString("utf8")) as { extensions?: OpenVsxExtension[] };
  return processOpenVsxEntries(body.extensions ?? [], limit, fetchDeps);
}

export async function resolveOpenVsxIntegritySha256(
  latest: OpenVsxLatestVersion,
  deps: OpenVsxFetchDeps = {}
): Promise<string> {
  const shaUrl = latest.files.sha256?.trim();
  if (!shaUrl) {
    throw new Error(INTEGRITY_METADATA_MISSING_ERROR);
  }
  assertOpenVsxUrlHost(shaUrl);
  const res = await safeFetch(
    shaUrl,
    openVsxFetchOptions(deps, EXTENSION_INSTALL_LIMITS.SHA256_RESPONSE_MAX_BYTES)
  );
  if (!res.ok) {
    throw new Error(INTEGRITY_METADATA_MISSING_ERROR);
  }
  const digest = parseSha256Digest(res.buffer.toString("utf8"));
  if (!digest || !isValidSha256Hex(digest)) {
    throw new Error(INTEGRITY_METADATA_MISSING_ERROR);
  }
  return digest;
}

export async function downloadOpenVsxVsix(
  namespace: string,
  name: string,
  deps: OpenVsxFetchDeps | typeof fetch = {}
): Promise<{ buffer: Buffer; version: OpenVsxLatestVersion; sha256: string }> {
  const fetchDeps: OpenVsxFetchDeps =
    typeof deps === "function" ? { fetchImpl: deps } : deps;

  const latest = await getLatestOpenVsxVersion(namespace, name, fetchDeps);
  if (!latest) {
    throw new Error(`Extensia ${namespace}.${name} nu a fost găsită pe Open VSX.`);
  }
  if (!latest.engines?.vscode || !isVsCodeEngineCompatible(latest.engines.vscode)) {
    throw new Error(`Extensia necesită VS Code ${latest.engines?.vscode ?? "?"} — incompatibilă.`);
  }

  // Final URL host must be on allowlist (also revalidated on every redirect by safeFetch).
  assertOpenVsxUrlHost(latest.files.download);

  const expectedSha = await resolveOpenVsxIntegritySha256(latest, fetchDeps);

  const res = await safeFetch(
    latest.files.download,
    openVsxFetchOptions(fetchDeps, EXTENSION_INSTALL_LIMITS.VSIX_MAX_BYTES)
  );
  if (!res.ok) {
    throw new Error(`Descărcare VSIX eșuată (${res.status}).`);
  }
  assertVsixSizeLimit(res.buffer.length, res.headers.get("content-length"));
  const sha256 = assertExpectedSha256(res.buffer, expectedSha);
  return { buffer: res.buffer, version: latest, sha256 };
}

export function formatOpenVsxNetworkError(error: unknown): string {
  if (error instanceof NetworkGuardError) {
    return sanitizeNetworkError(error);
  }
  return error instanceof Error ? error.message : String(error);
}
