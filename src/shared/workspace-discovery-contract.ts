/**
 * Renderer-safe workspace discovery snapshot — no absolute paths or secrets.
 */

export type WorkspaceLockfileKind = "npm" | "pnpm" | "yarn";

export interface WorkspaceDiscoveryScripts {
  typecheck?: string;
  lint?: string;
  test?: string;
  build?: string;
  dev?: string;
}

export interface WorkspaceDiscoveryGit {
  isRepo: boolean;
  branch?: string;
  modifiedCount: number;
  modifiedFiles: string[];
  lastCommit?: string;
}

export interface WorkspaceDiscoveryTodo {
  file: string;
  line: number;
  tag: string;
  excerpt: string;
}

export interface WorkspaceDiscoveryVerify {
  ran: boolean;
  summary: string;
  allOk?: boolean;
}

export interface WorkspaceDiscoverySnapshot {
  ok: boolean;
  error?: string;
  projectName: string;
  projectType: string;
  packageManager?: WorkspaceLockfileKind;
  hasPackageJson: boolean;
  hasReadme: boolean;
  rootEntries: string[];
  keyDirs: string[];
  scripts: WorkspaceDiscoveryScripts;
  lockfile?: WorkspaceLockfileKind;
  git?: WorkspaceDiscoveryGit;
  todos: WorkspaceDiscoveryTodo[];
  verify?: WorkspaceDiscoveryVerify;
  recommendedNextStep: string;
}

export function isUrlLikeWorkspacePath(raw: string): boolean {
  const trimmed = raw.trim();
  return /^https?:\/\//i.test(trimmed) || /^file:\/\//i.test(trimmed);
}
