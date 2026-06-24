import type { ComposerPatchFile, ComposerPatchSet } from "../composer/types";

export type ReviewDecision = "pending" | "accepted" | "rejected";

export interface ReviewLine {
  id: string;
  type: "context" | "add" | "remove";
  oldLineNumber?: number;
  newLineNumber?: number;
  content: string;
  decision: ReviewDecision;
  semanticTag?: "rename" | "refactor" | "new_symbol" | "delete_symbol" | "logic_change";
}

export interface ReviewHunk {
  id: string;
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: ReviewLine[];
  decision: ReviewDecision;
  aiExplanation?: string;
}

export interface ReviewFile {
  id: string;
  path: string;
  patch: string;
  semanticSummary?: string;
  hunks: ReviewHunk[];
  decision: ReviewDecision;
  stats: { additions: number; deletions: number };
}

export interface ReviewComment {
  id: string;
  targetType: "file" | "hunk" | "line";
  targetId: string;
  author: "user" | "ai";
  text: string;
  createdAt: string;
  threadId?: string;
}

export interface CodeReviewSession {
  id: string;
  workspaceRoot: string;
  summary: string;
  files: ReviewFile[];
  comments: ReviewComment[];
  status: "pending" | "accepted" | "rejected" | "applied" | "revising";
  snapshotId?: string;
  createdAt: string;
}

export interface ReviewValidateResult {
  ok: boolean;
  diagnostics: Array<{ level: "info" | "warning" | "error"; message: string; file?: string }>;
}

export interface ReviewRevisionRequest {
  sessionId: string;
  comments: ReviewComment[];
  patches: ComposerPatchSet;
}
