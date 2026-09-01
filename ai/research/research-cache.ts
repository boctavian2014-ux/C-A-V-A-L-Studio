import type { ProductIntent, ProductResearchRun } from "./types";
import { RESEARCH_CACHE_TTL_MS } from "./types";

interface CacheEntry {
  value: ProductResearchRun;
  expiresAt: number;
}

const store = new Map<string, CacheEntry>();

export function hashResearchKey(intent: Pick<ProductIntent, "category" | "industry" | "primaryGoal" | "platform" | "references">): string {
  const refs = [...intent.references].map((u) => u.toLowerCase()).sort().join(",");
  const raw = [intent.category ?? "", intent.industry, intent.primaryGoal ?? "", intent.platform, refs].join("|");
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export function readResearchCache(key: string, now = Date.now()): ProductResearchRun | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    store.delete(key);
    return null;
  }
  return { ...entry.value, cacheHit: true };
}

export function writeResearchCache(
  key: string,
  value: ProductResearchRun,
  ttlMs = RESEARCH_CACHE_TTL_MS,
  now = Date.now()
): void {
  store.set(key, { value: { ...value, cacheHit: false }, expiresAt: now + ttlMs });
}

export function clearResearchCache(): void {
  store.clear();
}

export function researchCacheSize(): number {
  return store.size;
}
