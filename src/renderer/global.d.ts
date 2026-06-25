declare module "*.css";
declare module "xterm/css/xterm.css";

interface CavalFsApi {
  pickFiles: () => Promise<string[] | null>;
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
  filePair: (projectPath: string, filePath: string, staged: boolean) => Promise<{
    original: string;
    modified: string;
    language: string;
  }>;
  revertHunk: (projectPath: string, filePath: string, hunkPatch: string) => Promise<{
    ok: boolean;
    error?: string;
  }>;
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

interface CavalImageApi {
  generate: (params: {
    prompt: string;
    size?: "1024x1024" | "1792x1024" | "1024x1792";
    quality?: "standard" | "hd";
    style?: "vivid" | "natural";
    apiKey: string;
  }) => Promise<{ ok: boolean; url?: string; revisedPrompt?: string; error?: string }>;
  save: (imageUrl: string, projectPath: string, fileName: string) => Promise<{ ok: boolean; savedPath?: string; error?: string }>;
  saveAs: (imageUrl: string) => Promise<{ ok: boolean; savedPath?: string; error?: string }>;
}

interface CavalStreamChunk {
  streamId: string;
  type: "meta" | "delta" | "done" | "error";
  delta?: string;
  error?: string;
  resolvedModel?: string;
  reason?: string;
  model?: string;
  provider?: string;
}

interface CavalPreloadApi {
  status: () => Promise<{
    enabled: boolean;
    workerReady: boolean;
    workspaceRoot: string | null;
    inFlight: number;
    ollamaReachable: boolean | null;
    cache: { entries: Array<{ modelId: string; status: string; stage: string; priority: number }> };
  }>;
  warm: (modelId: string, stage?: string) => Promise<{ ok: boolean }>;
  invalidate: () => Promise<{ ok: boolean }>;
  notify: (input: {
    action: string;
    openFiles?: string[];
    activeFile?: string;
    modelId?: string;
  }) => Promise<{ ok: boolean }>;
  subscribe: () => void;
  unsubscribe: () => void;
  onEvent: (callback: (event: { type: string; modelId?: string; stage?: string; message?: string }) => void) => () => void;
}

interface CavalCadApi {
  plan: (input: {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    latestUserText: string;
    openRouterApiKey?: string;
    previousMeshTaskId?: string;
  }) => Promise<{
    ok: boolean;
    plan?: {
      action: 'clarify' | 'generate';
      userLanguage: 'ro' | 'en';
      intent: 'mechanical' | 'organic' | 'figurine' | 'mixed';
      pipeline: 'openscad' | 'mesh';
      questions?: string[];
      assistantMessage?: string;
      technicalPrompt: string;
      suggestedDimensions?: string;
      warnings?: string[];
      quickReplies?: string[];
    };
    error?: string;
  }>;
  createJob: (input: {
    prompt: string;
    projectType?: string;
    constraints?: Record<string, string | undefined>;
    cavalId?: string;
    planContext?: {
      requirements?: string;
      assembly?: string;
      components?: string;
      performance?: string;
    };
    openRouterApiKey?: string;
    meshApiKey?: string;
    quality?: 'standard' | 'high';
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
    previousScad?: string;
    generationMode?: 'openscad' | 'mesh';
    meshPrompt?: string;
    previousMeshTaskId?: string;
  }) => Promise<{ ok: boolean; jobId?: string; status?: string; error?: string }>;
  getJob: (jobId: string) => Promise<{
    ok: boolean;
    jobId?: string;
    status?: string;
    stlUrl?: string | null;
    scad?: string | null;
    error?: string | null;
    dimensions?: { x: number; y: number; z: number } | null;
    meshTaskId?: string | null;
  }>;
  downloadStl: (input: { url: string; defaultName?: string }) => Promise<{
    ok: boolean;
    canceled?: boolean;
    path?: string;
    error?: string;
  }>;
  downloadScad: (input: { content: string; defaultName?: string }) => Promise<{
    ok: boolean;
    canceled?: boolean;
    path?: string;
    error?: string;
  }>;
}

interface CavalSchematicApi {
  generateFromCode: (input: {
    workspaceRoot: string;
    files?: string[];
    objective?: string;
    useSample?: boolean;
  }) => Promise<{ ok: boolean; graph?: Record<string, unknown>; error?: string }>;
  generateCode: (input: {
    workspaceRoot: string;
    graph: Record<string, unknown>;
    delta: Record<string, unknown>;
    skipSuggestions?: boolean;
  }) => Promise<{
    ok: boolean;
    patchSet?: { summary: string; files: Array<{ path: string; patch: string }> };
    composerPhase?: string;
    reviewSessionId?: string;
    suggestionsSessionId?: string;
    error?: string;
  }>;
  explain: (input: {
    graph: Record<string, unknown>;
    nodeId?: string;
    edgeId?: string;
  }) => Promise<{ ok: boolean; content?: string; error?: string }>;
  analyze: (input: { graph: Record<string, unknown> }) => Promise<{
    ok: boolean;
    issues?: Array<{ id: string; severity: string; kind: string; message: string }>;
    error?: string;
  }>;
  autoLayout: (input: { graph: Record<string, unknown> }) => Promise<{
    ok: boolean;
    graph?: Record<string, unknown>;
    error?: string;
  }>;
}

interface CavalBridge {
  version?: string;
  productName?: string;
  ready?: () => void;
  onMenuCommand?: (callback: (command: string) => void) => () => void;
  onFileOpened?: (callback: (file: { path: string; label: string; language: string; content: string }) => void) => () => void;
  onFolderOpened?: (callback: (folder: { path: string; files: Array<{ path: string; label: string; language: string; content: string }> }) => void) => () => void;
  saveFile?: (request: { path?: string; content: string; saveAs?: boolean }) => Promise<{ canceled?: boolean; path?: string; label?: string; language?: string }>;
  chatStream?: (
    request: {
      message: string;
      model: string;
      mode?: "ask" | "plan" | "code" | "architect" | "debug";
      streamId: string;
      context?: {
        filePath?: string;
        fileContent?: string;
        projectContext?: string;
        mentions?: string[];
      };
    },
    onChunk: (chunk: CavalStreamChunk) => void
  ) => () => void;
  engineeringExportPdf?: (input: { content: string; defaultName?: string }) => Promise<{
    ok: boolean;
    canceled?: boolean;
    path?: string;
    error?: string;
  }>;
  billingUserId?: () => Promise<{ ok: boolean; userId?: string }>;
  billingEntitlements?: () => Promise<{
    ok: boolean;
    plan?: string;
    status?: string;
    entitlements?: string[];
    expiresAt?: string;
    error?: string;
  }>;
  billingCheckout?: (input: { email: string }) => Promise<{ ok: boolean; url?: string; error?: string }>;
  secretsGet?: () => Promise<{ ok: boolean; secrets?: Record<string, string> }>;
  secretsSet?: (secrets: Record<string, string>) => Promise<{ ok: boolean }>;
  settingsLoad?: () => Promise<{ ok: boolean; settings?: Record<string, string> }>;
  settingsSave?: (settings: Record<string, string>) => Promise<{ ok: boolean }>;
  fs: CavalFsApi;
  terminal: CavalTerminalApi;
  git: CavalGitApi;
  image: CavalImageApi;
  preload: CavalPreloadApi;
  cad: CavalCadApi;
  schematic: CavalSchematicApi;
  window: CavalWindowApi;
}

declare global {
  interface Window {
    caval: CavalBridge;
  }
}

export {};
