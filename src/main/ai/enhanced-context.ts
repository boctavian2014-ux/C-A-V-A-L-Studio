/**
 * Pas 7d.3 — chat context enriched with workspace index search hits.
 * Read-only: never writes the index or project sources.
 */

import fs from "node:fs/promises";
import path from "node:path";

import {
  ENHANCED_CONTEXT_DEFAULT_MAX_FILES,
  ENHANCED_CONTEXT_DEFAULT_MAX_TOKENS_PER_FILE,
  ENHANCED_CONTEXT_MIN_RELEVANCE,
  type EnhancedContext,
  type EnhancedContextRequest,
  type FileContext,
} from "../../shared/ai-context-contract";
import { isSensitiveFile, sanitizeFileContent } from "../../shared/ai-context-security";
import { workspaceFilePathOverlaps } from "../../shared/ai-context-prepare";
import {
  normalizeIndexRelativePath,
  type IndexedFile,
  type IndexedSymbol,
  type WorkspaceIndex,
} from "../../shared/workspace-index-contract";
import { resolveSandboxedWorkspacePath } from "../path-security";
import { loadWorkspaceIndex } from "../workspace/workspace-index-store";
import { workspaceIndexService } from "../workspace/workspace-index-service";
import {
  isWorkspaceIndexReady,
  searchIndex,
} from "../workspace/workspace-search";

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "fix",
  "bug",
  "with",
  "from",
  "this",
  "that",
  "into",
  "onto",
  "over",
  "under",
  "when",
  "what",
  "where",
  "which",
  "while",
  "about",
  "after",
  "before",
  "please",
  "could",
  "would",
  "should",
  "make",
  "update",
  "change",
  "refactor",
  "implement",
  "create",
  "add",
  "remove",
  "delete",
  "help",
  "need",
  "want",
  "code",
  "file",
  "files",
  "function",
  "class",
  "error",
  "issue",
  "problem",
]);

/** ~4 chars per token — same heuristic as context-builder. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function truncateToTokens(content: string, maxTokens: number): string {
  if (maxTokens <= 0) return "";
  const maxChars = Math.max(1, Math.floor(maxTokens) * 4);
  if (content.length <= maxChars) return content;
  return `${content.slice(0, Math.max(0, maxChars - 1))}…`;
}

/**
 * Prefer camelCase / PascalCase / snake_case / path-like tokens over stop words.
 * Ex: "Fix the bug in validateEmail" → "validateEmail"
 */
export function extractSearchQuery(userMessage: string): string {
  const raw = typeof userMessage === "string" ? userMessage.trim() : "";
  if (!raw) return "";

  const cleaned = raw.replace(/[^\w./\\-]+/g, " ");
  const words = cleaned.split(/\s+/).filter(Boolean);

  type Scored = { word: string; score: number };
  const scored: Scored[] = [];

  for (const word of words) {
    const bare = word.replace(/^['"`]+|['"`]+$/g, "");
    if (bare.length < 3) continue;
    const lower = bare.toLowerCase();
    if (STOP_WORDS.has(lower)) continue;

    let score = 0;
    if (/\.(ts|tsx|js|jsx|mjs|cjs|py|json)$/i.test(bare)) score += 12;
    if (/[\\/]/.test(bare)) score += 11;
    if (/^[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+$/.test(bare)) score += 10; // PascalCase
    if (/^[a-z]+(?:[A-Z][a-z0-9]+)+$/.test(bare)) score += 10; // camelCase
    if (/^[a-zA-Z_][a-zA-Z0-9]*_[a-zA-Z0-9_]+$/.test(bare)) score += 8; // snake_case
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(bare) && bare.length > 2) score += 3;
    if (/^[a-z]+$/.test(bare) && bare.length < 6) score -= 2;
    if (score > 0) scored.push({ word: bare, score });
  }

  scored.sort((a, b) => b.score - a.score || b.word.length - a.word.length);
  if (scored[0]) return scored[0].word;

  const fallback = words.filter((w) => w.length > 2).slice(0, 3).join(" ");
  return fallback || raw.slice(0, 48);
}

export function toWorkspaceRelativePath(
  workspaceRoot: string,
  filePath: string
): string {
  const trimmed = filePath.trim();
  if (!trimmed) return "";
  try {
    const abs = path.isAbsolute(trimmed)
      ? trimmed
      : path.join(workspaceRoot, trimmed);
    const rel = path.relative(workspaceRoot, abs).replace(/\\/g, "/");
    if (!rel || rel.startsWith("..")) {
      return normalizeIndexRelativePath(trimmed);
    }
    return normalizeIndexRelativePath(rel);
  } catch {
    return normalizeIndexRelativePath(trimmed);
  }
}

async function resolveIndex(workspaceRoot: string): Promise<WorkspaceIndex | null> {
  const root = path.resolve(workspaceRoot.trim());
  const summary = workspaceIndexService.getSummary();
  const liveRoot = summary.workspaceRoot
    ? path.resolve(summary.workspaceRoot)
    : null;
  if (liveRoot && liveRoot === root) {
    const live = workspaceIndexService.getIndex();
    if (isWorkspaceIndexReady(live)) return live;
  }
  const disk = await loadWorkspaceIndex(root);
  if (disk && isWorkspaceIndexReady(disk)) return disk;
  return disk;
}

export async function readFileRedacted(
  workspaceRoot: string,
  relativePath: string,
  maxTokens: number
): Promise<string | null> {
  const rel = normalizeIndexRelativePath(relativePath);
  if (!rel || isSensitiveFile(rel)) return null;

  try {
    const absolutePath = resolveSandboxedWorkspacePath(workspaceRoot, rel);
    let content = await fs.readFile(absolutePath, "utf8");
    content = sanitizeFileContent(content);
    const tokens = estimateTokens(content);
    if (tokens > maxTokens) {
      content = truncateToTokens(content, maxTokens);
    }
    return content;
  } catch {
    return null;
  }
}

function findIndexedFile(
  index: WorkspaceIndex | null | undefined,
  relativePath: string
): IndexedFile | undefined {
  if (!index) return undefined;
  const target = normalizeIndexRelativePath(relativePath);
  return index.files.find((f) => f.path === target);
}

function relevantSymbols(
  file: IndexedFile | undefined,
  searchQuery: string
): IndexedSymbol[] {
  if (!file?.symbols?.length) return [];
  const q = searchQuery.toLowerCase();
  if (!q) return file.symbols.slice(0, 20);
  const matched = file.symbols.filter((s) => s.name.toLowerCase().includes(q));
  return (matched.length ? matched : file.symbols).slice(0, 20);
}

export async function buildEnhancedContext(
  workspaceRoot: string,
  request: EnhancedContextRequest
): Promise<EnhancedContext> {
  const maxFiles = Math.max(
    0,
    Math.min(
      5,
      request.maxFiles ?? ENHANCED_CONTEXT_DEFAULT_MAX_FILES
    )
  );
  const maxTokensPerFile = Math.max(
    200,
    Math.min(
      8_000,
      request.maxTokensPerFile ?? ENHANCED_CONTEXT_DEFAULT_MAX_TOKENS_PER_FILE
    )
  );

  const userMessage =
    typeof request.userMessage === "string" ? request.userMessage : "";
  const searchQuery = extractSearchQuery(userMessage);
  const root = workspaceRoot?.trim() ?? "";

  const empty: EnhancedContext = {
    relatedFiles: [],
    searchQuery,
    totalTokens: 0,
  };

  if (!root) return empty;

  const index = await resolveIndex(root);
  const currentRel = request.currentFile
    ? toWorkspaceRelativePath(root, request.currentFile)
    : "";

  const relatedFiles: FileContext[] = [];
  let totalTokens = 0;

  if (index && searchQuery) {
    const searchResults = searchIndex(index, {
      text: searchQuery,
      limit: Math.max(maxFiles * 2, maxFiles + 2),
    });

    for (const result of searchResults) {
      if (relatedFiles.length >= maxFiles) break;
      if (result.score < ENHANCED_CONTEXT_MIN_RELEVANCE) continue;
      if (currentRel && result.file.path === currentRel) continue;

      const content = await readFileRedacted(
        root,
        result.file.path,
        maxTokensPerFile
      );
      if (!content) continue;

      relatedFiles.push({
        path: result.file.path,
        content,
        relevanceScore: result.score,
        symbols: relevantSymbols(result.file, searchQuery),
      });
      totalTokens += estimateTokens(content);
    }
  }

  let currentFileContext: FileContext | undefined;
  if (currentRel) {
    const content = await readFileRedacted(root, currentRel, maxTokensPerFile);
    if (content) {
      const indexed = findIndexedFile(index, currentRel);
      currentFileContext = {
        path: currentRel,
        content,
        relevanceScore: 1.0,
        symbols: relevantSymbols(indexed, searchQuery),
      };
      totalTokens += estimateTokens(content);
    }
  }

  return {
    currentFile: currentFileContext,
    relatedFiles,
    searchQuery,
    totalTokens,
  };
}

export interface FormatEnhancedContextOptions {
  /** Paths already present in IDE context / the user turn — do not paste again. */
  skipFilePaths?: string[];
}

function shouldSkipEnhancedPath(filePath: string, skip: string[]): boolean {
  return skip.some((s) => workspaceFilePathOverlaps(filePath, s));
}

/** Prompt block: labeled untrusted so models treat it as data, not instructions. */
export function formatEnhancedContextForPrompt(
  ctx: EnhancedContext,
  opts?: FormatEnhancedContextOptions
): string {
  const skip = opts?.skipFilePaths ?? [];
  const currentFile =
    ctx.currentFile && !shouldSkipEnhancedPath(ctx.currentFile.path, skip)
      ? ctx.currentFile
      : undefined;
  const relatedFiles = ctx.relatedFiles.filter((f) => !shouldSkipEnhancedPath(f.path, skip));
  if (!currentFile && relatedFiles.length === 0) return "";

  const lines: string[] = [
    '<<ENHANCED_CONTEXT kind="untrusted workspace content">>',
    "Related workspace files:",
  ];
  if (ctx.searchQuery) {
    lines.push(`Search query: ${ctx.searchQuery}`);
  }

  if (currentFile) {
    lines.push(`--- Current file: ${currentFile.path} ---`);
    lines.push(currentFile.content);
  }

  for (const file of relatedFiles) {
    lines.push(
      `--- Related file: ${file.path} (relevance: ${file.relevanceScore.toFixed(2)}) ---`
    );
    lines.push(file.content);
  }

  lines.push("<</ENHANCED_CONTEXT>>");
  return lines.join("\n");
}
