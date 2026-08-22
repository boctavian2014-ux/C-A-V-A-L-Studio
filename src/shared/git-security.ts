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
  if (name.startsWith("-")) return false;
  return true;
}

export function isValidCommitMessage(message: unknown): message is string {
  return typeof message === "string" && message.trim().length > 0 && message.length < 10000;
}

export function isGitFileStatus(status: unknown): status is GitFileStatus {
  return typeof status === "string" && VALID_FILE_STATUSES.includes(status as GitFileStatus);
}

export function isValidStashMessage(message: unknown): message is string {
  return (
    typeof message === "string" &&
    message.trim().length > 0 &&
    message.length < 1000 &&
    !message.includes("\0")
  );
}

const ALLOWED_CLONE_PROTOCOLS = ["https:", "git@", "ssh:"] as const;
const BLOCKED_CLONE_PATTERNS = [
  /file:/i,
  /ftp:/i,
  /data:/i,
  /javascript:/i,
  /localhost/i,
  /127\.\d+\.\d+\.\d+/,
  /192\.168\.\d+\.\d+/,
  /10\.\d+\.\d+\.\d+/,
  /172\.(1[6-9]|2\d|3[01])\.\d+\.\d+/,
];

/** GitHub `owner/repo` shorthand used by the welcome clone field. */
const GITHUB_SHORTHAND = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;

export function isValidCloneUrl(url: unknown): url is string {
  if (typeof url !== "string" || url.length === 0) return false;
  if (url.length > 2048) return false;

  for (const pattern of BLOCKED_CLONE_PATTERNS) {
    if (pattern.test(url)) return false;
  }

  const hasAllowedProtocol = ALLOWED_CLONE_PROTOCOLS.some((p) => url.startsWith(p));
  const isSshFormat = /^git@[a-zA-Z0-9.-]+:[a-zA-Z0-9/_.-]+\.git$/.test(url);
  const isGithubShorthand = GITHUB_SHORTHAND.test(url.trim());

  return hasAllowedProtocol || isSshFormat || isGithubShorthand;
}
