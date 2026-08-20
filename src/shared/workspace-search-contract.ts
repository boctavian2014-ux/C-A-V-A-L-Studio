/**
 * Pas 7d.2 — lexical search over the workspace structure index (no embeddings).
 */

import type { IndexedFile } from "./workspace-index-contract";

export type WorkspaceSearchKind = "symbol" | "file" | "import" | "export" | "all";

export interface WorkspaceSearchQuery {
  text: string;
  kind?: WorkspaceSearchKind;
  limit?: number;
}

export type SearchMatchType = "symbol" | "path" | "import" | "export";

export interface SearchMatch {
  type: SearchMatchType;
  value: string;
  line?: number;
}

export interface WorkspaceSearchResult {
  file: IndexedFile;
  /** Best weighted match score in [0, 1]. */
  score: number;
  matches: SearchMatch[];
}

export interface WorkspaceSearchResponse {
  ok: boolean;
  results: WorkspaceSearchResult[];
  error?: string;
}

export const WORKSPACE_SEARCH_DEFAULT_LIMIT = 20;
export const WORKSPACE_SEARCH_MAX_LIMIT = 50;

export function normalizeWorkspaceSearchQuery(
  query: WorkspaceSearchQuery
): { text: string; kind: WorkspaceSearchKind; limit: number } {
  const text = typeof query?.text === "string" ? query.text.trim() : "";
  const kindRaw = query?.kind;
  const kind: WorkspaceSearchKind =
    kindRaw === "symbol" ||
    kindRaw === "file" ||
    kindRaw === "import" ||
    kindRaw === "export" ||
    kindRaw === "all"
      ? kindRaw
      : "all";
  const rawLimit = query?.limit ?? WORKSPACE_SEARCH_DEFAULT_LIMIT;
  const limit = Math.max(
    1,
    Math.min(
      WORKSPACE_SEARCH_MAX_LIMIT,
      Number.isFinite(rawLimit) ? Math.floor(rawLimit) : WORKSPACE_SEARCH_DEFAULT_LIMIT
    )
  );
  return { text, kind, limit };
}
