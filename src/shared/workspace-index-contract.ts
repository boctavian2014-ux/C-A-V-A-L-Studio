/**
 * Pas 7d.1 — lightweight workspace structure index (symbols / imports / exports).
 * Regenerable; no function bodies stored.
 */

export type IndexedSymbolKind =
  | "function"
  | "class"
  | "interface"
  | "type"
  | "const"
  | "export";

export interface IndexedSymbol {
  name: string;
  kind: IndexedSymbolKind;
  line: number;
}

export interface IndexedFile {
  /** Relative to workspace root, POSIX separators. */
  path: string;
  language: string;
  symbols: IndexedSymbol[];
  imports: string[];
  exports: string[];
  sizeBytes: number;
  lastIndexed: number;
}

export interface WorkspaceIndex {
  files: IndexedFile[];
  lastFullScan: number;
  totalFiles: number;
}

export interface WorkspaceIndexSummary {
  totalFiles: number;
  lastFullScan: number;
  indexing: boolean;
  workspaceRoot: string | null;
}

/** Caps for 7d.1 scan. */
export const WORKSPACE_INDEX_MAX_FILE_BYTES = 500 * 1024;
export const WORKSPACE_INDEX_MAX_FILES = 5000;
export const WORKSPACE_INDEX_WATCH_DEBOUNCE_MS = 300;

export const WORKSPACE_INDEX_RELATIVE_PATH = ".cavalo/ai/workspace-index.json";

export const WORKSPACE_INDEX_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".json",
]);

export const WORKSPACE_INDEX_DIR_EXCLUDES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  ".cavalo",
  ".next",
  "coverage",
  "__pycache__",
]);

/** Lock / generated JSON never worth indexing. */
export const WORKSPACE_INDEX_FILE_EXCLUDES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lock",
  "bun.lockb",
]);

export function emptyWorkspaceIndex(): WorkspaceIndex {
  return { files: [], lastFullScan: 0, totalFiles: 0 };
}

export function normalizeIndexRelativePath(raw: string): string {
  return raw.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/^\/+/, "");
}
