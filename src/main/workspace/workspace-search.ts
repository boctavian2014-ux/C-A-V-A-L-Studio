/**
 * Pas 7d.2 — deterministic fuzzy search over WorkspaceIndex (symbols / path / import / export).
 */

import type { WorkspaceIndex } from "../../shared/workspace-index-contract";
import {
  normalizeWorkspaceSearchQuery,
  type SearchMatch,
  type WorkspaceSearchQuery,
  type WorkspaceSearchResult,
} from "../../shared/workspace-search-contract";

const WEIGHT = {
  path: 0.8,
  symbol: 1.0,
  import: 0.5,
  export: 0.7,
} as const;

/** Exported for unit tests. */
export function fuzzyMatch(text: string, query: string): number {
  if (!query) return 0;
  if (text === query) return 1.0;
  if (text.startsWith(query)) return 0.9;
  if (text.includes(query)) return 0.6;

  let queryIdx = 0;
  for (const char of text) {
    if (char === query[queryIdx]) queryIdx++;
    if (queryIdx === query.length) return 0.3;
  }
  return 0;
}

export function searchIndex(
  index: WorkspaceIndex,
  query: WorkspaceSearchQuery
): WorkspaceSearchResult[] {
  const { text, kind, limit } = normalizeWorkspaceSearchQuery(query);
  const normalizedQuery = text.toLowerCase();
  if (!normalizedQuery) return [];

  const results: WorkspaceSearchResult[] = [];

  for (const file of index.files) {
    const matches: SearchMatch[] = [];
    let best = 0;

    if (kind === "all" || kind === "file") {
      const pathScore = fuzzyMatch(file.path.toLowerCase(), normalizedQuery);
      if (pathScore > 0) {
        matches.push({ type: "path", value: file.path });
        best = Math.max(best, pathScore * WEIGHT.path);
      }
    }

    if (kind === "all" || kind === "symbol") {
      for (const symbol of file.symbols) {
        const symbolScore = fuzzyMatch(symbol.name.toLowerCase(), normalizedQuery);
        if (symbolScore > 0) {
          matches.push({
            type: "symbol",
            value: symbol.name,
            line: symbol.line,
          });
          best = Math.max(best, symbolScore * WEIGHT.symbol);
        }
      }
    }

    if (kind === "all" || kind === "import") {
      for (const imp of file.imports) {
        const importScore = fuzzyMatch(imp.toLowerCase(), normalizedQuery);
        if (importScore > 0) {
          matches.push({ type: "import", value: imp });
          best = Math.max(best, importScore * WEIGHT.import);
        }
      }
    }

    if (kind === "all" || kind === "export") {
      for (const exp of file.exports) {
        const exportScore = fuzzyMatch(exp.toLowerCase(), normalizedQuery);
        if (exportScore > 0) {
          matches.push({ type: "export", value: exp });
          best = Math.max(best, exportScore * WEIGHT.export);
        }
      }
    }

    if (matches.length > 0) {
      results.push({
        file,
        score: Math.min(1, best),
        matches,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function isWorkspaceIndexReady(index: WorkspaceIndex | null | undefined): boolean {
  if (!index) return false;
  // Cached or freshly scanned (including empty workspaces after a completed scan).
  return index.lastFullScan > 0 || index.files.length > 0;
}

export const INDEX_UNAVAILABLE_MESSAGE =
  "Index not available, please wait for indexing";
