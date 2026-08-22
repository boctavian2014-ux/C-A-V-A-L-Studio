/**
 * Pas 5.2 — IDE context attached to chat messages.
 *
 * Renderer builds an IdeContextPayload from editor/problems/git/output stores.
 * Main validates, budgets, and formats it for the prompt.
 * Never serialize AbortSignal, functions, or workspaceRoot as authority.
 */

export type IdeContextMode = "enabled" | "disabled";

export interface ChatTabContext {
  /** Default: enabled. Persists on the chat thread/tab. */
  ideContextMode: IdeContextMode;
}

export type IdeProblemSeverity = "error" | "warning" | "info" | "hint";

export interface IdeContextSelection {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  text: string;
}

export interface IdeContextActiveFile {
  path: string;
  language: string;
  selection?: IdeContextSelection;
  /** Full-file fallback when there is no selection (budgeted). */
  content?: string;
}

export interface IdeContextProblem {
  file: string;
  line: number;
  column: number;
  severity: IdeProblemSeverity;
  source: string;
  message: string;
  code?: string;
}

export interface IdeContextGit {
  branch?: string;
  changedFiles: string[];
}

/** Renderer → main chat attachment (optional). Absent when toggle is OFF. */
export interface IdeContextPayload {
  activeFile?: IdeContextActiveFile;
  problems?: IdeContextProblem[];
  git?: IdeContextGit;
  outputTail?: string;
}

/** Budget caps (characters / counts) — applied deterministically in main. */
export const IDE_CONTEXT_TOTAL_CHARS = 8_000;
export const IDE_CONTEXT_SELECTION_CHARS = 3_500;
export const IDE_CONTEXT_FILE_CHARS = 3_000;
export const IDE_CONTEXT_OUTPUT_CHARS = 1_000;
export const IDE_CONTEXT_PROBLEMS_MAX = 25;
export const IDE_CONTEXT_GIT_FILES_MAX = 40;

/** Pas 7d.3 — workspace-search-backed related files for chat. */
export const ENHANCED_CONTEXT_DEFAULT_MAX_FILES = 3;
export const ENHANCED_CONTEXT_DEFAULT_MAX_TOKENS_PER_FILE = 2000;
export const ENHANCED_CONTEXT_MIN_RELEVANCE = 0.6;

export interface EnhancedContextRequest {
  userMessage: string;
  /** Relative or absolute path of the active editor file. */
  currentFile?: string;
  currentSelection?: IdeContextSelection;
  maxFiles?: number;
  maxTokensPerFile?: number;
}

export interface FileContext {
  path: string;
  /** Redacted, size-capped content. */
  content: string;
  /** 0–1 from workspace search (current file is always 1.0). */
  relevanceScore: number;
  symbols: import("./workspace-index-contract").IndexedSymbol[];
}

export interface EnhancedContext {
  currentFile?: FileContext;
  relatedFiles: FileContext[];
  /** Keyword / identifier extracted from the user message. */
  searchQuery: string;
  totalTokens: number;
}
