import type { MarketplaceExtension } from '../../marketplace/api';
import { isVsCodeEngineCompatible } from '../extensions/vscode-engine';

const OPEN_VSX_BASE = 'https://open-vsx.org/api';

export interface OpenVsxExtension {
  namespace: string;
  name: string;
  displayName?: string;
  description?: string;
  downloadCount?: number;
  averageRating?: number;
  reviewCount?: number;
  version?: string;
  files?: { download?: string; icon?: string };
  engines?: { vscode?: string; caval?: string };
}

export interface OpenVsxLatestVersion extends OpenVsxExtension {
  version: string;
  files: { download: string; icon?: string };
}

export function mapToMarketplaceExtension(entry: OpenVsxExtension): MarketplaceExtension {
  const now = new Date().toISOString();
  return {
    id: `${entry.namespace}.${entry.name}`,
    publisher: entry.namespace,
    name: entry.name,
    version: entry.version ?? '0.0.0',
    displayName: entry.displayName ?? entry.name,
    description: entry.description ?? '',
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
  if (entry.engines?.vscode) {
    return isVsCodeEngineCompatible(entry.engines.vscode);
  }
  return true;
}

export async function getLatestOpenVsxVersion(
  namespace: string,
  name: string,
  fetchImpl: typeof fetch = fetch
): Promise<OpenVsxLatestVersion | null> {
  const res = await fetchImpl(`${OPEN_VSX_BASE}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/latest`);
  if (!res.ok) return null;
  const data = (await res.json()) as OpenVsxLatestVersion;
  if (!data.files?.download) return null;
  return data;
}

async function enrichWithEngines(
  entry: OpenVsxExtension,
  fetchImpl: typeof fetch
): Promise<OpenVsxExtension> {
  if (entry.engines?.vscode) return entry;
  const latest = await getLatestOpenVsxVersion(entry.namespace, entry.name, fetchImpl);
  if (!latest) return entry;
  return {
    ...entry,
    version: latest.version ?? entry.version,
    engines: latest.engines,
    files: { ...entry.files, download: latest.files.download, icon: latest.files.icon ?? entry.files?.icon },
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
  fetchImpl: typeof fetch
): Promise<MarketplaceExtension[]> {
  const enriched = await Promise.all(raw.slice(0, limit).map((e) => enrichWithEngines(e, fetchImpl)));
  return sortExtensionsByRating(
    enriched.filter(isInstallableOpenVsxExtension).map(mapToMarketplaceExtension)
  );
}

export async function listPopularOpenVsx(
  limit = 30,
  fetchImpl: typeof fetch = fetch
): Promise<MarketplaceExtension[]> {
  const params = new URLSearchParams({ size: String(Math.min(limit, 50)) });
  const res = await fetchImpl(`${OPEN_VSX_BASE}/-/search?${params}`);
  if (!res.ok) {
    throw new Error(`Open VSX popular list failed (${res.status})`);
  }

  const body = (await res.json()) as { extensions?: OpenVsxExtension[] };
  return processOpenVsxEntries(body.extensions ?? [], limit, fetchImpl);
}

export async function searchOpenVsx(
  query: string,
  limit = 30,
  fetchImpl: typeof fetch = fetch
): Promise<MarketplaceExtension[]> {
  const q = query.trim();
  if (!q) return [];

  const params = new URLSearchParams({ query: q, size: String(Math.min(limit, 50)) });
  const res = await fetchImpl(`${OPEN_VSX_BASE}/-/search?${params}`);
  if (!res.ok) {
    throw new Error(`Open VSX search failed (${res.status})`);
  }

  const body = (await res.json()) as { extensions?: OpenVsxExtension[] };
  return processOpenVsxEntries(body.extensions ?? [], limit, fetchImpl);
}

export async function downloadOpenVsxVsix(
  namespace: string,
  name: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ buffer: Buffer; version: OpenVsxLatestVersion }> {
  const latest = await getLatestOpenVsxVersion(namespace, name, fetchImpl);
  if (!latest) {
    throw new Error(`Extensia ${namespace}.${name} nu a fost găsită pe Open VSX.`);
  }
  if (!latest.engines?.vscode || !isVsCodeEngineCompatible(latest.engines.vscode)) {
    throw new Error(`Extensia necesită VS Code ${latest.engines?.vscode ?? '?'} — incompatibilă.`);
  }

  const res = await fetchImpl(latest.files.download);
  if (!res.ok) {
    throw new Error(`Descărcare VSIX eșuată (${res.status}).`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), version: latest };
}
