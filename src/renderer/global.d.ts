declare module "*.css";
declare module "xterm/css/xterm.css";

interface CavalFsApi {
  openFolder: () => Promise<string | null>;
  readTree: (dirPath: string) => Promise<import("./store/editor-store").FileNode[]>;
  readFile: (filePath: string) => Promise<{ ok: boolean; content: string; error?: string }>;
  writeFile: (filePath: string, content: string) => Promise<{ ok: boolean; error?: string }>;
  createFile: (filePath: string) => Promise<{ ok: boolean; error?: string }>;
  createDir: (dirPath: string) => Promise<{ ok: boolean; error?: string }>;
  rename: (oldPath: string, newPath: string) => Promise<{ ok: boolean; error?: string }>;
  delete: (targetPath: string) => Promise<{ ok: boolean; error?: string }>;
  reveal: (filePath: string) => Promise<{ ok: boolean }>;
}

interface CavalTerminalApi {
  create: (id: string) => Promise<{ ok: boolean; error?: string }>;
  write: (id: string, data: string) => Promise<{ ok: boolean; error?: string }>;
  resize: (id: string, cols: number, rows: number) => Promise<{ ok: boolean }>;
  destroy: (id: string) => Promise<{ ok: boolean }>;
  onData: (id: string, cb: (data: string) => void) => () => void;
}

interface CavalWindowApi {
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
}

interface GitFileStatus {
  path: string;
  status: string;
  staged: boolean;
  oldPath?: string;
}

interface GitCommit {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  date: string;
  refs: string;
}

interface GitStatus {
  branch: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  files: GitFileStatus[];
  isRepo: boolean;
}

interface CavalGitApi {
  status: (projectPath: string) => Promise<GitStatus>;
  diff: (projectPath: string, filePath: string, staged: boolean) => Promise<string>;
  stage: (projectPath: string, filePath: string) => Promise<{ ok: boolean; error?: string }>;
  unstage: (projectPath: string, filePath: string) => Promise<{ ok: boolean; error?: string }>;
  stageAll: (projectPath: string) => Promise<{ ok: boolean; error?: string }>;
  unstageAll: (projectPath: string) => Promise<{ ok: boolean; error?: string }>;
  discard: (projectPath: string, filePath: string) => Promise<{ ok: boolean; error?: string }>;
  commit: (projectPath: string, message: string) => Promise<{ ok: boolean; error?: string; hash?: string }>;
  push: (projectPath: string, setUpstream?: boolean) => Promise<{ ok: boolean; error?: string }>;
  pull: (projectPath: string) => Promise<{ ok: boolean; error?: string }>;
  log: (projectPath: string, limit?: number) => Promise<GitCommit[]>;
  branches: (projectPath: string) => Promise<string[]>;
  checkout: (projectPath: string, branch: string) => Promise<{ ok: boolean; error?: string }>;
  createBranch: (projectPath: string, name: string) => Promise<{ ok: boolean; error?: string }>;
  stash: (projectPath: string, message?: string) => Promise<{ ok: boolean; error?: string }>;
  stashPop: (projectPath: string) => Promise<{ ok: boolean; error?: string }>;
}

interface CavalBridge {
  version?: string;
  productName?: string;
  ready?: () => void;
  fs: CavalFsApi;
  terminal: CavalTerminalApi;
  git: CavalGitApi;
  window: CavalWindowApi;
  [key: string]: unknown;
}

declare global {
  interface Window {
    caval: CavalBridge;
  }
}

export {};
