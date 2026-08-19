import type { GitFileStatus } from "./git-contract";

const VALID_FILE_STATUSES: readonly GitFileStatus[] = [
  "modified",
  "added",
  "deleted",
  "renamed",
  "copied",
  "untracked",
  "ignored",
  "conflicted",
];

export function isValidFilePath(path: unknown): path is string {
  if (typeof path !== "string" || path.length === 0) return false;
  if (path.includes("..")) return false;
  if (path.startsWith("/") || path.startsWith("\\")) return false;
  if (/^[a-zA-Z]:/.test(path)) return false;
  return true;
}

export function isValidFilePathArray(paths: unknown): paths is string[] {
  return Array.isArray(paths) && paths.every(isValidFilePath);
}

export function isValidBranchName(name: unknown): name is string {
  if (typeof name !== "string" || name.length === 0) return false;
  if (/[\s~^:?*[\]\\]/.test(name)) return false;
  if (name.includes("..")) return false;
  if (name.startsWith(".") || name.endsWith(".")) return false;
  if (name.startsWith("/") || name.endsWith("/")) return false;
  return true;
}

export function isValidCommitMessage(message: unknown): message is string {
  return typeof message === "string" && message.trim().length > 0 && message.length < 10000;
}

export function isGitFileStatus(status: unknown): status is GitFileStatus {
  return typeof status === "string" && VALID_FILE_STATUSES.includes(status as GitFileStatus);
}
