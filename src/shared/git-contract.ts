/**
 * M3 Git IPC contract — shared by main, preload, and renderer.
 *
 * Security: the renderer never sends a free git/shell command or workspace cwd.
 * Main binds cwd to the workspace and validates relative paths before argv exec.
 */

export type GitFileStatus =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "copied"
  | "untracked"
  | "ignored"
  | "conflicted";

export interface GitFileChange {
  path: string;
  status: GitFileStatus;
  staged: boolean;
  /** Present for renamed / copied files. */
  originalPath?: string;
}

export interface GitBranch {
  name: string;
  current: boolean;
  remote: string | null;
  ahead: number;
  behind: number;
}

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  files: GitFileChange[];
  hasConflicts: boolean;
  isClean: boolean;
}

export interface GitCommitInput {
  message: string;
  /** If omitted, main commits what is already staged — not the whole workspace. */
  files?: string[];
}

export interface GitCommitResult {
  hash: string;
  message: string;
}

export interface GitLogEntry {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  email: string;
  date: string;
}

export interface GitDiffResult {
  path: string;
  diff: string;
  binary: boolean;
}

export type GitOperationStatus = "idle" | "running" | "success" | "failed";

export interface GitOperationState {
  operation: "stage" | "unstage" | "commit" | "checkout" | "fetch" | "pull" | "push";
  status: GitOperationStatus;
  error: string | null;
  timestamp: number;
}

export interface GitApi {
  status(): Promise<GitStatus>;
  stage(files: string[]): Promise<void>;
  unstage(files: string[]): Promise<void>;
  discardChanges(files: string[]): Promise<void>;
  commit(input: GitCommitInput): Promise<GitCommitResult>;
  branches(): Promise<GitBranch[]>;
  checkout(branch: string): Promise<void>;
  createBranch(name: string, from?: string): Promise<void>;
  diff(file?: string, staged?: boolean): Promise<GitDiffResult>;
  log(limit?: number): Promise<GitLogEntry[]>;
  onStatusChange(cb: (status: GitStatus) => void): () => void;
  onOperationChange(cb: (state: GitOperationState) => void): () => void;
}

/** Relative workspace path for git argv — no NUL, no flag-looking names. */
export function isGitRelPath(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 4096 || trimmed.includes("\0")) return false;
  if (trimmed.startsWith("-")) return false;
  return true;
}

export function isGitBranchName(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 255) return false;
  if (trimmed.startsWith("-") || trimmed.includes("\0")) return false;
  if (/[\s~^:?*[\]\\]|@{|\.\./.test(trimmed)) return false;
  return true;
}
