// ──────────────────────────────────────────────
//  Featured / popular models — priority ordering
// ──────────────────────────────────────────────

import type { CatalogEntry } from "./model-catalog";

/** BYOK model IDs — always available in Paid group */
export const FEATURED_BYOK_IDS = [
  "claude-sonnet-4",
  "claude-opus-4",
  "gpt-4o",
  "gpt-4o-mini",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
] as const;

/** OpenRouter free model ID substrings (matched against openrouter:provider/model) */
export const FEATURED_OR_FREE_PATTERNS = [
  "anthropic/claude-3.5-haiku:free",
  "anthropic/claude-3-haiku:free",
  "openai/gpt-4o-mini:free",
  "google/gemini-2.0-flash-exp:free",
  "google/gemini-2.5-flash-preview:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen-2.5-coder-32b-instruct:free",
  "deepseek/deepseek-chat:free",
] as const;

/** OpenRouter paid model ID substrings */
export const FEATURED_OR_PAID_PATTERNS = [
  "anthropic/claude-sonnet-4",
  "anthropic/claude-3.5-sonnet",
  "anthropic/claude-opus-4",
  "openai/gpt-4o",
  "openai/o3-mini",
  "google/gemini-2.5-pro-preview",
  "google/gemini-2.5-flash-preview",
] as const;

function matchesPattern(id: string, patterns: readonly string[]): boolean {
  const normalized = id.replace(/^openrouter:/, "");
  return patterns.some((p) => normalized.includes(p) || id.includes(p));
}

function priorityIndex(id: string, ordered: readonly string[]): number {
  const normalized = id.replace(/^openrouter:/, "");
  for (let i = 0; i < ordered.length; i++) {
    const p = ordered[i];
    if (id === p || normalized.includes(p) || id.includes(p)) return i;
  }
  return ordered.length;
}

function sortFeatured(entries: CatalogEntry[], priorityList: readonly string[]): CatalogEntry[] {
  const featured: CatalogEntry[] = [];
  const rest: CatalogEntry[] = [];
  const seen = new Set<string>();

  for (const p of priorityList) {
    const match = entries.find(
      (e) => !seen.has(e.id) && (e.id === p || matchesPattern(e.id, [p]))
    );
    if (match) {
      featured.push(match);
      seen.add(match.id);
    }
  }

  for (const entry of entries) {
    if (!seen.has(entry.id)) rest.push(entry);
  }

  rest.sort((a, b) => a.label.localeCompare(b.label));

  return [...featured, ...rest];
}

export function sortFeaturedFree(entries: CatalogEntry[]): CatalogEntry[] {
  return sortFeatured(entries, FEATURED_OR_FREE_PATTERNS);
}

export function sortFeaturedPaid(entries: CatalogEntry[], codingIds: Set<string>): CatalogEntry[] {
  const byok = FEATURED_BYOK_IDS
    .map((id) => entries.find((e) => e.id === id))
    .filter((e): e is CatalogEntry => e != null);

  const byokIds = new Set(byok.map((e) => e.id));
  const orPaid = entries.filter(
    (e) =>
      !byokIds.has(e.id) &&
      !codingIds.has(e.id) &&
      e.source === "openrouter" &&
      matchesPattern(e.id, FEATURED_OR_PAID_PATTERNS)
  );

  orPaid.sort(
    (a, b) =>
      priorityIndex(a.id, FEATURED_OR_PAID_PATTERNS) -
      priorityIndex(b.id, FEATURED_OR_PAID_PATTERNS)
  );

  const used = new Set([...byokIds, ...orPaid.map((e) => e.id)]);
  const rest = entries
    .filter((e) => !used.has(e.id) && !codingIds.has(e.id) && e.source === "byok")
    .sort((a, b) => a.label.localeCompare(b.label));

  const orRest = entries
    .filter((e) => !used.has(e.id) && !codingIds.has(e.id) && e.source === "openrouter")
    .sort((a, b) => a.label.localeCompare(b.label));

  return [...byok, ...orPaid, ...rest, ...orRest];
}
