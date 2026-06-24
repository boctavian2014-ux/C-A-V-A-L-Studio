// ──────────────────────────────────────────────
//  Unified model catalog — single source of truth
// ──────────────────────────────────────────────

import { modelProfiles } from "../model-profiles";
import { MODELS as BYOK_MODELS } from "../multi-model/provider";
import { sortFeaturedFree, sortFeaturedPaid } from "./featured-models";
import { fetchOpenRouterCatalog, type OpenRouterCatalogEntry } from "./openrouter-catalog";

export type AutoTierId = "caval-auto/free" | "caval-auto/balanced" | "caval-auto/frontier";

export type ModelSelectionId = AutoTierId | string;

export type ModelTier = "auto" | "free" | "paid";
export type ModelSource = "caval" | "local" | "byok" | "openrouter";

export interface CatalogEntry {
  id: ModelSelectionId;
  label: string;
  tier: ModelTier;
  source: ModelSource;
  provider: string;
  contextWindow: number;
  color: string;
  description?: string;
  isAuto?: boolean;
}

export interface ModelCatalogSnapshot {
  auto: CatalogEntry[];
  free: CatalogEntry[];
  paid: CatalogEntry[];
  coding: CatalogEntry[];
  all: CatalogEntry[];
  fetchedAt: number;
}

export interface ChatModelGroups {
  auto: CatalogEntry[];
  free: CatalogEntry[];
  paid: CatalogEntry[];
  coding: CatalogEntry[];
}

const CODING_HEURISTIC =
  /coder|codestral|devstral|mini-code|deepseek.*coder|qwen.*coder|code-/i;

function isCodingProfile(profile: (typeof modelProfiles)[number]): boolean {
  return profile.specialization.includes("coding");
}

function isCodingOpenRouterEntry(entry: CatalogEntry): boolean {
  if (entry.tier !== "paid" || entry.source !== "openrouter") return false;
  return CODING_HEURISTIC.test(entry.id) || CODING_HEURISTIC.test(entry.label);
}

function sortByLabel(entries: CatalogEntry[]): CatalogEntry[] {
  return [...entries].sort((a, b) => a.label.localeCompare(b.label));
}

export function buildCodingEntries(free: CatalogEntry[], paid: CatalogEntry[]): CatalogEntry[] {
  const freeIds = new Set(free.map((e) => e.id));
  const profileIds = new Set(
    modelProfiles.filter((p) => isCodingProfile(p) && p.costEstimate !== "local").map((p) => p.id)
  );

  const frontier = paid.filter((e) => profileIds.has(e.id) && !freeIds.has(e.id));
  const openRouterCoding = paid.filter(
    (e) => !freeIds.has(e.id) && !profileIds.has(e.id) && isCodingOpenRouterEntry(e)
  );

  const sortFrontier = [...frontier].sort((a, b) => {
    const aScore = modelProfiles.find((p) => p.id === a.id)?.defaultScore ?? 0;
    const bScore = modelProfiles.find((p) => p.id === b.id)?.defaultScore ?? 0;
    return bScore - aScore;
  });

  return dedupeById([...sortFrontier, ...sortByLabel(openRouterCoding)]);
}

export function getChatModelGroups(catalog: ModelCatalogSnapshot): ChatModelGroups {
  const codingIds = new Set(catalog.coding.map((e) => e.id));
  return {
    auto: catalog.auto.filter((e) => e.id === "caval-auto/free"),
    free: sortFeaturedFree(catalog.free),
    paid: sortFeaturedPaid(catalog.paid, codingIds),
    coding: catalog.coding,
  };
}

const AUTO_ENTRIES: CatalogEntry[] = [
  {
    id: "caval-auto/free",
    label: "Auto Free",
    tier: "auto",
    source: "caval",
    provider: "caval",
    contextWindow: 0,
    color: "#2FBF71",
    description: "Alege automat cel mai bun model gratuit disponibil",
    isAuto: true,
  },
  {
    id: "caval-auto/balanced",
    label: "Auto Balanced",
    tier: "auto",
    source: "caval",
    provider: "caval",
    contextWindow: 0,
    color: "#61AFEF",
    description: "Routing cost-eficient pentru task-uri zilnice",
    isAuto: true,
  },
  {
    id: "caval-auto/frontier",
    label: "Auto Frontier",
    tier: "auto",
    source: "caval",
    provider: "caval",
    contextWindow: 0,
    color: "#C678DD",
    description: "Modele frontier pentru task-uri complexe",
    isAuto: true,
  },
];

const PROVIDER_COLORS: Record<string, string> = {
  poolside: "#C678DD",
  openrouter: "#61AFEF",
  nvidia: "#76B900",
  north: "#F59E0B",
  open_source: "#F59E0B",
  anthropic: "#C678DD",
  openai: "#2FBF71",
  google: "#61AFEF",
  ollama: "#F59E0B",
};

function colorFor(provider: string): string {
  return PROVIDER_COLORS[provider] ?? "#8A95A6";
}

function profileToEntry(profile: (typeof modelProfiles)[number]): CatalogEntry {
  const isFree = profile.costEstimate === "local";
  return {
    id: profile.id,
    label: profile.displayName,
    tier: isFree ? "free" : "paid",
    source: profile.provider === "open_source" ? "local" : "caval",
    provider: profile.provider,
    contextWindow: profile.contextWindow,
    color: colorFor(profile.provider),
  };
}

function byokToEntry(model: (typeof BYOK_MODELS)[number]): CatalogEntry {
  const isFree = model.costPer1kIn === 0 && model.costPer1kOut === 0;
  return {
    id: model.id,
    label: model.label,
    tier: isFree ? "free" : "paid",
    source: "byok",
    provider: model.provider,
    contextWindow: model.contextWindow,
    color: model.color,
  };
}

function openRouterToEntry(entry: OpenRouterCatalogEntry): CatalogEntry {
  return {
    id: entry.id,
    label: entry.label,
    tier: entry.isFree ? "free" : "paid",
    source: "openrouter",
    provider: entry.provider,
    contextWindow: entry.contextWindow,
    color: entry.color,
  };
}

function dedupeById(entries: CatalogEntry[]): CatalogEntry[] {
  const seen = new Set<string>();
  const result: CatalogEntry[] = [];
  for (const entry of entries) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    result.push(entry);
  }
  return result;
}

let catalogCache: ModelCatalogSnapshot | null = null;

export async function buildModelCatalog(forceRefresh = false): Promise<ModelCatalogSnapshot> {
  if (!forceRefresh && catalogCache) {
    return catalogCache;
  }

  const openRouter = await fetchOpenRouterCatalog(forceRefresh);
  const profileEntries = modelProfiles.map(profileToEntry);
  const byokEntries = BYOK_MODELS.map(byokToEntry);
  const orEntries = openRouter.map(openRouterToEntry);

  const free = dedupeById([
    ...profileEntries.filter((e) => e.tier === "free"),
    ...byokEntries.filter((e) => e.tier === "free"),
    ...orEntries.filter((e) => e.tier === "free"),
  ]);

  const paid = dedupeById([
    ...profileEntries.filter((e) => e.tier === "paid"),
    ...byokEntries.filter((e) => e.tier === "paid"),
    ...orEntries.filter((e) => e.tier === "paid"),
  ]);

  const coding = buildCodingEntries(free, paid);
  const all = [...AUTO_ENTRIES, ...free, ...paid, ...coding];

  catalogCache = {
    auto: AUTO_ENTRIES,
    free,
    paid,
    coding,
    all: dedupeById(all),
    fetchedAt: Date.now(),
  };

  return catalogCache;
}

export function getCatalogEntry(id: ModelSelectionId, catalog?: ModelCatalogSnapshot): CatalogEntry | undefined {
  const snap = catalog ?? catalogCache;
  if (!snap) return undefined;
  return snap.all.find((e) => e.id === id);
}

export function isAutoTier(id: ModelSelectionId): id is AutoTierId {
  return id === "caval-auto/free" || id === "caval-auto/balanced" || id === "caval-auto/frontier";
}

export function invalidateCatalogCache(): void {
  catalogCache = null;
}
