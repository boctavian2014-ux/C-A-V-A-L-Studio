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
  | "untracked"
  | "ignored";

export interface GitFileChange {
  path: string;
  status: GitFileStatus;
  staged: boolean;
}

export interface GitBranch {
  name: string;
  current: boolean;
  remote: string | null;
}

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  files: GitFileChange[];
}

export interface GitCommitInput {
  message: string;
  files?: string[];
}

export interface GitLogEntry {
  hash: string;
  message: string;
  author: string;
  date: string;
}

export interface GitApi {
  status(): Promise<GitStatus>;
  stage(files: string[]): Promise<void>;
  unstage(files: string[]): Promise<void>;
  commit(input: GitCommitInput): Promise<void>;
  branches(): Promise<GitBranch[]>;
  checkout(branch: string): Promise<void>;
  diff(file?: string): Promise<string>;
  log(limit?: number): Promise<GitLogEntry[]>;
}

const GIT_FILE_STATUSES = new Set<GitFileStatus>([
  "modified",
  "added",
  "deleted",
  "renamed",
  "untracked",
  "ignored",
]);

export function isGitFileStatus(value: unknown): value is GitFileStatus {
  return typeof value === "string" && GIT_FILE_STATUSES.has(value as GitFileStatus);
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
