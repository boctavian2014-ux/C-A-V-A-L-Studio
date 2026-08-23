declare module "*.css";
declare module "*.png" {
  const src: string;
  export default src;
}
declare module "*.jpg" {
  const src: string;
  export default src;
}
declare module "*.jpeg" {
  const src: string;
  export default src;
}
declare module "xterm/css/xterm.css";
declare module "@xterm/xterm/css/xterm.css";

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

interface CavalTerminalApi extends Omit<import("../shared/terminal-contract").TerminalApi, "create"> {
  create: {
    (options?: import("../shared/terminal-contract").TerminalCreateOptions): Promise<
      import("../shared/terminal-contract").TerminalInfo
    >;
    (
      id: string,
      options?: { cwd?: string }
    ): Promise<
      | import("../shared/terminal-contract").TerminalInfo
      | { ok: boolean; error?: string; shell?: string; kind?: string; cwd?: string }
    >;
  };
  write: (
    id: string,
    data: string
  ) => Promise<void | { ok: boolean; error?: string }>;
  resize: (id: string, cols: number, rows: number) => Promise<void | { ok: boolean }>;
  destroy: (id: string) => Promise<void | { ok: boolean }>;
  ensurePowerShell: () => Promise<{
    ok: boolean;
    already?: boolean;
    upgraded?: boolean;
    error?: string;
    path?: string;
  }>;
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
  init: (projectPath: string) => Promise<{ ok: boolean; error?: string }>;
  stash: (projectPath: string, message?: string) => Promise<{ ok: boolean; error?: string }>;
  stashPop: (projectPath: string) => Promise<{ ok: boolean; error?: string }>;
  clone: (input: { url: string; parentDir?: string }) => Promise<{ ok: boolean; path?: string; error?: string }>;
}

interface EngFileInput {
  name: string;
  content: string;
}

interface EngPartInput {
  name: string;
  qty: number;
  unitPrice: number;
  currency: string;
  shop: string;
  shopUrl: string;
  substitute?: string;
}

interface EngSaveResult {
  ok: boolean;
  savedPath?: string;
  savedPaths?: string[];
  error?: string;
}

interface CavalEngineeringApi {
  saveFile: (projectPath: string, file: EngFileInput) => Promise<EngSaveResult>;
  saveAll: (projectPath: string, files: EngFileInput[]) => Promise<EngSaveResult>;
  exportCart: (parts: EngPartInput[], projectPath: string | null) => Promise<EngSaveResult>;
  openExternal: (
    url: string,
    origin?: "EXTERNAL_CONTENT"
  ) => Promise<{ ok: boolean; error?: string }>;
}
type ChatActivityPhase =
  | "prepare"
  | "route"
  | "connect"
  | "think"
  | "write";

interface CavalStreamChunk {
  streamId: string;
  type: "meta" | "delta" | "done" | "error" | "tool" | "status" | "reasoning" | "multiagent" | "reasoning-brief" | "delivery-pause" | "timeline";
  delta?: string;
  reasoningDelta?: string;
  error?: string;
  resolvedModel?: string;
  reason?: string;
  model?: string;
  provider?: string;
  toolName?: string;
  toolStatus?: "start" | "done" | "error";
  toolDetail?: string;
  toolWrittenPath?: string;
  phase?: ChatActivityPhase;
  multiAgentPhase?: "memory" | "integrate" | "context" | "modelOrch" | "orchestrator" | "decompose" | "subagent" | "merge" | "supervisor" | "compose" | "userSim" | "security" | "performance";
  status?: "active" | "done";
  label?: string;
  detail?: string;
  multiAgentModel?: string;
  multiAgentStepId?: string;
  multiAgentAuditBadge?: string;
  multiAgentParallelGroup?: string;
  goal?: string;
  approach?: string;
  modules?: string[];
  reasoningBrief?: { goal: string; approach: string; modules: string[] };
  event?: import('../../src/shared/ai-timeline-contract').TimelineEvent;
  quickFix?: import('../../src/shared/ai-quick-fix-contract').QuickFixResult;
  explain?: import('../../src/shared/ai-explain-contract').ExplainResult;
  terminalExplain?: import('../../src/shared/ai-terminal-contract').TerminalExplainResult;
  terminalSuggest?: import('../../src/shared/ai-terminal-contract').TerminalSuggestResult;
  refactor?: import('../../src/shared/ai-refactor-contract').RefactorResult;
  proposedWrites?: import('../../src/shared/ai-chat-apply-contract').ProposedWrite[];
  proposeStageKey?: string;
  pipelineRecapMeta?: {
    taskCount: number;
    fastPipeline: boolean;
    pendingIssues: string[];
    devTools?: Record<string, unknown>;
    supervisor?: { approved: boolean; summary: string; issues: unknown[] };
    deliveryBlocked?: boolean;
    needsReview?: boolean;
    verifyPending?: boolean;
    roleModelMap?: Record<string, string>;
    capabilitySnapshot?: Record<
      string,
      { reasoning?: number; coding?: number; planning?: number; toolUse?: number }
    >;
    selfAuditSummary?: string;
  };
      composeText?: string;
      writtenFiles?: string[];
      pauseReason?: "ui-design";
  runId?: string;
  deliveryBlocked?: boolean;
  needsReview?: boolean;
  verifyPending?: boolean;
  completionGate?: { ok: boolean; issues: Array<{ code: string; message: string }> };
}

interface CavalChatPrepareResult {
  ok: boolean;
  draftHash: string;
  warmContextReady: boolean;
  resolvedModelHint?: string;
  tokenId?: string;
  error?: string;
}

interface McpServerStatus {
  id: string;
  name: string;
  running: boolean;
  tools: string[];
  toolDetails?: Array<{ serverId: string; name: string; description: string }>;
  error?: string;
  trustStatus?: "local_safe" | "allowed" | "denied" | "pending";
  capabilities?: string[];
  safety?: "LOCAL_SAFE" | "NETWORK_OR_WRITE";
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
  isCloudOnly?: () => Promise<{ cloudOnly: boolean }>;
  health?: () => Promise<import("../shared/cad-health-contract").CadHealthSnapshot>;
  plan: (input: {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    latestUserText: string;
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
    workspaceRoot?: string;
    planContext?: {
      requirements?: string;
      assembly?: string;
      components?: string;
      performance?: string;
    };
    quality?: 'standard' | 'high';
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
    previousScad?: string;
    generationMode?: 'openscad' | 'mesh' | 'library';
    meshPrompt?: string;
    previousMeshTaskId?: string;
  }) => Promise<{
    ok: boolean;
    jobId?: string;
    status?: string;
    code?: string;
    operationId?: string;
    phase?: string;
    ownerIsCaller?: boolean;
    error?: string;
  }>;
  getJob: (input: { jobId: string; cavalId?: string }) => Promise<{
    ok: boolean;
    jobId?: string;
    status?: string;
    stlUrl?: string | null;
    scad?: string | null;
    error?: string | null;
    dimensions?: { x: number; y: number; z: number } | null;
    meshTaskId?: string | null;
  }>;
  cancelJob: (input: { jobId: string; cavalId?: string; workspaceRoot?: string }) => Promise<{
    ok: boolean;
    jobId?: string;
    status?: string;
    remoteCancel?: "ok" | "failed" | "skipped";
    error?: string;
  }>;
  cancelJobs: (input: { jobIds: string[]; cavalId?: string; workspaceRoot?: string }) => Promise<{
    ok: boolean;
    partiallyCancelled?: boolean;
    results?: Array<{
      jobId: string;
      ok: boolean;
      remoteCancel?: string;
      error?: string;
    }>;
    error?: string;
  }>;
  heartbeat: (input: { jobId?: string; operationId?: string; workspaceRoot?: string }) => Promise<{ ok: boolean }>;
  getJobLogs: (input: { jobId: string; cavalId?: string }) => Promise<{
    ok: boolean;
    jobId?: string;
    logs?: Array<{ at: string; level: string; event: string; message?: string }>;
    error?: string;
  }>;
  downloadStl: (input: { url: string; defaultName?: string; cavalId?: string }) => Promise<{
    ok: boolean;
    canceled?: boolean;
    path?: string;
    error?: string;
  }>;
  saveStlBase64: (input: { base64: string; defaultName?: string }) => Promise<{
    ok: boolean;
    canceled?: boolean;
    path?: string;
    error?: string;
  }>;
  fetchStl: (input: { url: string; cavalId?: string }) => Promise<{
    ok: boolean;
    base64?: string;
    bytes?: number;
    error?: string;
  }>;
  downloadScad: (input: { content: string; defaultName?: string }) => Promise<{
    ok: boolean;
    canceled?: boolean;
    path?: string;
    error?: string;
  }>;
  installOpenScad?: () => Promise<{ ok: boolean; installed?: boolean; error?: string }>;
}

interface CavalRoboticsLibraryApi {
  cdnBase: () => Promise<{ ok: boolean; base?: string }>;
  getCatalog: () => Promise<{
    ok: boolean;
    catalog?: Record<string, { path: string; format: 'scad' | 'stl'; tags: string[]; label?: string }>;
    source?: string;
    error?: string;
  }>;
  ensureCached: (relPath: string) => Promise<{
    ok: boolean;
    localPath?: string;
    fromCache?: boolean;
    error?: string;
  }>;
  resolve: (standardKey: string) => Promise<{
    ok: boolean;
    key?: string;
    path?: string;
    format?: 'scad' | 'stl';
    localPath?: string;
    contentText?: string;
    contentBase64?: string;
    error?: string;
  }>;
  saveStlToProject: (input: {
    projectPath: string;
    fileName: string;
    base64: string;
  }) => Promise<{ ok: boolean; savedPath?: string; error?: string }>;
  exportZip: (input: {
    projectPath?: string;
    files: Array<{ name: string; base64: string }>;
  }) => Promise<{ ok: boolean; savedPath?: string; canceled?: boolean; error?: string }>;
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

type CavalPreviewApi = import("../shared/preview-contract").PreviewApi;

interface CavalBridge {
  version?: string;
  productName?: string;
  ready?: () => void;
  onMenuCommand?: (callback: (command: string) => void) => () => void;
  onFileOpened?: (callback: (file: { path: string; label: string; language: string; content: string }) => void) => () => void;
  onFolderOpened?: (callback: (folder: { path: string; files: Array<{ path: string; label: string; language: string; content: string }> }) => void) => () => void;
  saveFile?: (request: { path?: string; content: string; saveAs?: boolean }) => Promise<{ canceled?: boolean; path?: string; label?: string; language?: string }>;
  resolveModel?: (input: { model: string; intent?: string }) => Promise<{
    ok: boolean;
    resolved?: { modelId: string; provider: string; reason: string };
  }>;
  chatStream?: (
    request: {
      message: string;
      model: string;
      mode?: "ask" | "plan" | "code" | "agentic" | "architect" | "debug";
      intent?: string;
      streamId: string;
      workspaceRoot?: string;
      messages?: Array<{ role: "system" | "user" | "assistant"; content: string }>;
      jsonMode?: boolean;
      maxTokens?: number;
      temperature?: number;
      timeoutMs?: number;
      scaffoldMode?: boolean;
      skipMultiAgent?: boolean;
      strictReview?: boolean;
      quickFix?: import('../../src/shared/ai-quick-fix-contract').QuickFixRequest;
      quickFixAccept?: import('../../src/shared/ai-quick-fix-contract').QuickFixAcceptRequest;
      timelineFileWrite?: import('../../src/shared/ai-inline-completion-contract').TimelineFileWriteRequest;
      explain?: import('../../src/shared/ai-explain-contract').ExplainRequest;
      terminalExplain?: import('../../src/shared/ai-terminal-contract').TerminalExplainRequest;
      terminalSuggest?: import('../../src/shared/ai-terminal-contract').TerminalSuggestRequest;
      refactor?: import('../../src/shared/ai-refactor-contract').RefactorRequest;
      conversationId?: string;
      assistantMessageId?: string;
      context?: {
        filePath?: string;
        fileContent?: string;
        projectContext?: string;
        mentions?: string[];
        attachments?: Array<{ path: string; name: string; content: string }>;
      };
    },
    onChunk: (chunk: CavalStreamChunk) => void
  ) => () => void;
  abortChatStream?: (streamId: string) => Promise<{ ok: boolean }>;
  cancelOperation?: (input: {
    operationId?: string;
    streamId?: string;
    cadJobId?: string;
    workspaceRoot?: string;
    cavalId?: string;
  }) => Promise<{
    ok: boolean;
    status?: string;
    operationId?: string;
    streamId?: string;
    cadJobId?: string;
    signalAborted?: boolean;
    remoteCancel?: "ok" | "failed" | "skipped";
    error?: string;
  }>;
  onPipelineVerifyStatus?: (
    callback: (payload: {
      runId: string;
      streamId?: string;
      workspaceRoot: string;
      ok: boolean;
      summary: string;
      issues: Array<{ code: string; message: string }>;
      verifyRan: boolean;
    }) => void
  ) => () => void;
  getReasoningLayerConfig?: (workspaceRoot?: string) => Promise<{
    ok: boolean;
    config?: import('../../ai/composer/multi-agent/types').ReasoningLayerConfig;
  }>;
  workspaceSessionReset?: () => Promise<{ ok: boolean }>;
  onWorkspaceSessionReset?: (callback: () => void) => () => void;
  onRendererRecovered?: (
    callback: (payload: { reason: string; recoveredAt: string }) => void
  ) => () => void;
  getRecentPipelineCompletion?: (workspaceRoot: string) => Promise<{
    ok: boolean;
    completion?: {
      runId: string;
      writtenFiles: string[];
      composeText?: string;
      pipelineRecapMeta?: unknown;
      finishedAt: string;
    } | null;
  }>;
  chatApplyAccept?: (input: {
    stageKey?: string;
    writes?: import('../../src/shared/ai-chat-apply-contract').ProposedWrite[];
    conversationId?: string;
    messageId?: string;
    streamId?: string;
  }) => Promise<{
    ok: boolean;
    applied: string[];
    writes?: import('../../src/shared/ai-chat-apply-contract').ProposedWrite[];
    errors?: string[];
    error?: string;
  }>;
  chatApplyReject?: (input: { stageKey?: string }) => Promise<{ ok: boolean }>;
  chatApplyRevertNew?: (input: {
    writes: import('../../src/shared/ai-chat-apply-contract').ProposedWrite[];
  }) => Promise<{ ok: boolean; deleted: string[]; errors?: string[] }>;
  aiHistory?: {
    listConversations: (
      params?: import('../../src/shared/ai-history-contract').ListConversationsParams
    ) => Promise<{
      ok: boolean;
      conversations?: import('../../src/shared/ai-history-contract').ConversationSummary[];
      error?: string;
    }>;
    getConversation: (conversationId: string) => Promise<{
      ok: boolean;
      conversation?: import('../../src/shared/ai-history-contract').AiHistoryConversationPayload;
      error?: string;
    }>;
    getMessageDetails?: (messageId: string) => Promise<{
      ok: boolean;
      timeline?: import('../../src/shared/ai-timeline-contract').TimelineEvent[];
      writtenFiles?: import('../../src/shared/ai-history-contract').HistoryWrittenFile[];
      error?: string;
    }>;
    deleteConversation: (conversationId: string) => Promise<{ ok: boolean; error?: string }>;
    revertWrittenFile: (writtenFileId: string) => Promise<{
      ok: boolean;
      error?: string;
      filePath?: string;
    }>;
    exportConversation: (
      req: import('../../src/shared/ai-history-contract').ExportRequest
    ) => Promise<import('../../src/shared/ai-history-contract').ExportResult>;
    setFeedback: (
      messageId: string,
      rating: 'positive' | 'negative',
      comment?: string,
      streamId?: string
    ) => Promise<{
      ok: boolean;
      feedback?: import('../../src/shared/ai-history-contract').MessageFeedback;
      error?: string;
    }>;
    getFeedback: (
      messageId: string,
      streamId?: string
    ) => Promise<{
      ok: boolean;
      feedback?: import('../../src/shared/ai-history-contract').MessageFeedback | null;
      error?: string;
    }>;
    clearFeedback: (
      messageId: string,
      streamId?: string
    ) => Promise<{ ok: boolean; error?: string }>;
  };
  aiSettings?: {
    getSettings: () => Promise<{
      ok: boolean;
      settings?: import('../../src/shared/ai-settings-contract').AiSettings;
      error?: string;
    }>;
    updateSettings: (
      partial: Partial<import('../../src/shared/ai-settings-contract').AiSettings>
    ) => Promise<{
      ok: boolean;
      settings?: import('../../src/shared/ai-settings-contract').AiSettings;
      error?: string;
    }>;
    resetSettings: () => Promise<{
      ok: boolean;
      settings?: import('../../src/shared/ai-settings-contract').AiSettings;
      error?: string;
    }>;
  };
  workspaceIndex?: {
    getSummary: () => Promise<{
      ok: boolean;
      summary?: import('../../src/shared/workspace-index-contract').WorkspaceIndexSummary;
      error?: string;
    }>;
    getIndex: () => Promise<{
      ok: boolean;
      index?: import('../../src/shared/workspace-index-contract').WorkspaceIndex;
      error?: string;
    }>;
    refresh: () => Promise<{
      ok: boolean;
      index?: import('../../src/shared/workspace-index-contract').WorkspaceIndex;
      summary?: import('../../src/shared/workspace-index-contract').WorkspaceIndexSummary;
      error?: string;
    }>;
  };
  workspaceSearch?: {
    query: (
      query: import('../../src/shared/workspace-search-contract').WorkspaceSearchQuery
    ) => Promise<import('../../src/shared/workspace-search-contract').WorkspaceSearchResponse>;
  };
  pipelineResumeStream?: (
    input: {
      runId: string;
      streamId: string;
      uiPreferences: string;
      workspaceRoot: string;
      model: string;
      strictReview?: boolean;
    },
    onChunk: (chunk: CavalStreamChunk) => void
  ) => () => void;
  aiComplete?: (request: {
    model: string;
    intent?: string;
    capability?: string;
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    workspaceRoot?: string;
    requestId?: string;
    jsonMode?: boolean;
    maxTokens?: number;
    temperature?: number;
  }) => Promise<
    | { ok: true; text: string; resolvedModel: string; provider: string }
    | { ok: false; error: string }
  >;
  engineering: CavalEngineeringApi;
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
  secretsGet?: () => Promise<{
    ok: boolean;
    providers?: Array<{
      provider: string;
      configured: boolean;
      source: "environment" | "secure-storage" | "none";
      lastValidatedAt: string | null;
    }>;
    configured?: Record<string, boolean>;
    error?: string;
  }>;
  secretsSet?: (secrets: Record<string, string>) => Promise<{ ok: boolean; error?: string; key?: string }>;
  /** Pas 7f.1 — unified AI provider registry (no secret values). */
  aiProvidersList?: () => Promise<{
    ok: boolean;
    providers?: import("../shared/ai-provider-contract").AiProviderEntry[];
    preferredProviderId?: import("../shared/ai-provider-contract").AiProviderId;
    encryptionAvailable?: boolean;
    error?: string;
  }>;
  aiProvidersSetPreferred?: (input: { providerId: string }) => Promise<{
    ok: boolean;
    preferredProviderId?: import("../shared/ai-provider-contract").AiProviderId;
    error?: string;
  }>;
  /** Pas 7f.2 — subscribe to live local AI status (optional; UI falls back to refresh). */
  localAiOnStatusChanged?: (
    listener: (status: import("../shared/local-ai-contract").LocalAiStatus) => void
  ) => () => void;
  /** Lot C5.5 / 7f.4 — user-initiated key test; no bodies/keys in the response. */
  testProviderKey?: (input: {
    providerId: string;
    secretKey?: string;
    draft?: { baseUrl?: string; apiKey?: string; modelId?: string };
  }) => Promise<{
    ok: boolean;
    result: "valid" | "invalid" | "unreachable";
    error?: string;
  }>;
  settingsLoad?: () => Promise<{
    ok: boolean;
    settings?: Record<string, string>;
    cadConnection?: import("../shared/cad-connection-settings-contract").CadConnectionSettingsSnapshot;
  }>;
  settingsSave?: (
    settings: Record<string, string> & {
      cadApiUrlAction?: "clear";
    }
  ) => Promise<{
    ok: boolean;
    error?: string;
    cadConnection?: import("../shared/cad-connection-settings-contract").CadConnectionSettingsSnapshot;
    settings?: Record<string, string>;
  }>;
  locale?: {
    get: () => Promise<{
      ok: boolean;
      locale?: string;
      source?: "saved" | "system" | "default";
      error?: string;
    }>;
    set: (locale: string) => Promise<{
      ok: boolean;
      locale?: string;
      error?: string;
    }>;
  };
  localAiStatus?: () => Promise<{
    ok: boolean;
    status?: import("../shared/local-ai-contract").LocalAiStatus;
    error?: string;
  }>;
  localAiSetup?: (input?: {
    installRuntime?: boolean;
    pullModel?: boolean;
    modelName?: string;
  }) => Promise<{
    ok: boolean;
    changed?: boolean;
    summary?: string;
    error?: string;
    status?: import("../shared/local-ai-contract").LocalAiStatus;
  }>;
  /** Pas 7f.3 — separate install / pull. */
  localAiInstall?: (req: { confirmed: true }) => Promise<{
    success: boolean;
    error?: string;
    status?: import("../shared/local-ai-contract").LocalAiStatus;
  }>;
  localAiPullModel?: (req: { modelId: string; confirmed: true }) => Promise<{
    success: boolean;
    cancelled?: boolean;
    error?: string;
    status?: import("../shared/local-ai-contract").LocalAiStatus;
  }>;
  localAiPullCancel?: (modelId: string) => Promise<{ ok: boolean; error?: string }>;
  onLocalAiPullProgress?: (
    listener: (progress: import("../shared/local-ai-contract").OllamaModelPullProgress) => void
  ) => () => void;
  modelsHealth?: () => Promise<{
    ok: boolean;
    summary?: string;
    models?: Record<string, 'ready' | 'missing_key' | 'not_installed' | 'ollama_down' | 'unknown'>;
    providers?: Record<string, { ok: boolean; error?: string; installed?: string[] }>;
  }>;
  contextIndex?: () => Promise<{ ok: boolean; documentCount?: number; error?: string }>;
  contextSearch?: (input: { query: string; limit?: number }) => Promise<{ ok: boolean; results?: unknown[]; error?: string }>;
  workspaceOpen?: (
    folderPath: string,
    options?: { source?: 'folder' | 'clone' }
  ) => Promise<{ ok: boolean; path?: string; error?: string; cached?: boolean }>;
  workspaceSync?: (folderPath: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
  workspace?: {
    listRecent: () => Promise<{
      ok: boolean;
      entries?: Array<{
        path: string;
        name: string;
        lastOpened: string;
        source: 'folder' | 'clone';
      }>;
      error?: string;
    }>;
    removeRecent: (folderPath: string) => Promise<{
      ok: boolean;
      entries?: Array<{
        path: string;
        name: string;
        lastOpened: string;
        source: 'folder' | 'clone';
      }>;
      error?: string;
    }>;
    createOnDesktop: (input: { name: string }) => Promise<{
      ok: boolean;
      path?: string;
      location?: 'desktop' | 'downloads';
      error?: string;
    }>;
  };
  getWorkspaceBootstrap?: (workspaceRoot: string) => Promise<{ ok: boolean; bootstrap?: string }>;
  workspaceVerify?: (
    workspaceRoot: string,
    options?: { autoInstall?: boolean; writtenFiles?: string[] }
  ) => Promise<{
    ok: boolean;
    verify?: {
      ran: boolean;
      summary: string;
      commands: Array<{ command: string; ok: boolean; exitCode: number | null; output: string }>;
    };
    error?: string;
  }>;
  projectHealthCheck?: (action: "scan" | "execute") => Promise<{
    ok: boolean;
    snapshot?: {
      packageFound: boolean;
      packageName?: string;
      checks: Array<{
        id: "typecheck" | "lint" | "test" | "build";
        label: string;
        scriptKey: string;
        npmCommand: string;
        status:
          | "missing"
          | "available"
          | "running"
          | "passed"
          | "failed"
          | "skipped"
          | "timed_out";
        script?: string;
        exitCode?: number | null;
        output?: string;
      }>;
    };
    error?: string;
  }>;
  zlPrepare?: (signals: {
    workspaceRoot: string;
    objectiveDraft?: string;
    activeFile?: string;
    openFiles?: string[];
  }) => Promise<{ ok: boolean; tokenId?: string }>;
  zlCancel?: (tokenId: string) => Promise<{ ok: boolean }>;
  zlPanelOpen?: (input: {
    workspaceRoot?: string;
    objectiveDraft?: string;
    activeFile?: string;
    openFiles?: string[];
  }) => Promise<{ ok: boolean; tokenId?: string }>;
  zlSnapshot?: (input?: { workspaceRoot?: string; objectiveDraft?: string }) => Promise<{ ok: boolean; snapshot?: unknown }>;
  zlCompleteChat?: (signals: {
    workspaceRoot: string;
    objectiveDraft?: string;
    activeFile?: string;
    openFiles?: string[];
    selectedModel?: string;
  }) => Promise<{
    ok: boolean;
    prep?: {
      warmContext: string;
      partialPlan?: {
        planId: string;
        objective: string;
        confidence: number;
        plan: { steps: Array<{ title: string }> };
      };
      modelBundle?: { warmedModels: string[] };
    };
  }>;
  chatPrepare?: (input: {
    workspaceRoot: string;
    objectiveDraft: string;
    model: string;
    draftHash: string;
    activeFile?: string;
    openFiles?: string[];
  }) => Promise<CavalChatPrepareResult>;
  mcpList?: () => Promise<{ ok: boolean; servers?: McpServerStatus[]; remoteEnabled?: boolean }>;
  mcpEnsureReady?: () => Promise<{ ok: boolean; servers?: McpServerStatus[]; remoteEnabled?: boolean }>;
  mcpStart?: (serverId: string) => Promise<{ ok: boolean; status?: McpServerStatus; error?: string }>;
  mcpStop?: (serverId: string) => Promise<{ ok: boolean }>;
  mcpTrustList?: () => Promise<{ ok: boolean; records?: unknown[] }>;
  mcpTrustRevoke?: (input?: { serverId?: string }) => Promise<{
    ok: boolean;
    records?: unknown[];
    error?: string;
  }>;
  toolExecute?: (input: { name: string; arguments: Record<string, unknown> }) => Promise<{ ok: boolean; output?: unknown; error?: string }>;
  search?: {
    text?: (input: { query: string; caseSensitive?: boolean; maxResults?: number }) => Promise<{
      ok: boolean;
      hits?: Array<{ path: string; line: number; column: number; preview: string }>;
      error?: string;
    }>;
    indexSymbols?: () => Promise<{ ok: boolean; count?: number; error?: string }>;
    gotoDefinition?: (input: { filePath: string; symbol: string }) => Promise<{
      ok: boolean;
      location?: { filePath: string; line: number; column: number };
      error?: string;
    }>;
    findReferences?: (input: { filePath: string; symbol: string }) => Promise<{
      ok: boolean;
      references?: Array<{ filePath: string; line: number; column: number; preview?: string }>;
      error?: string;
    }>;
  };
  lsp?: {
    start?: (languageId: string) => Promise<{ ok: boolean; sessionId?: string; error?: string }>;
    stop?: (sessionId: string) => Promise<{ ok: boolean; error?: string }>;
    status?: () => Promise<{ ok: boolean; servers?: unknown[] }>;
  };
  fs: CavalFsApi;
  terminal: CavalTerminalApi;
  preview: CavalPreviewApi;
  extensions?: {
    list: () => Promise<{ ok: boolean; extensions?: unknown[] }>;
    register: (manifest: { id: string; name: string; version: string }) => Promise<{ ok: boolean; error?: string }>;
    install: (input: { extensionId: string }) => Promise<{
      ok: boolean;
      error?: string;
      extension?: unknown;
    }>;
  };
  openvsx?: {
    search: (query: string) => Promise<{ ok: boolean; extensions?: unknown[]; error?: string }>;
    popular: () => Promise<{ ok: boolean; extensions?: unknown[]; error?: string }>;
    install: (input: { namespace: string; name: string }) => Promise<{ ok: boolean; error?: string; extension?: unknown }>;
  };
  marketplace?: {
    health: () => Promise<{ ok: boolean; url?: string }>;
    search: (query: {
      text?: string;
      category?: string;
      sortBy?: string;
      limit?: number;
    }) => Promise<unknown[]>;
    autocomplete: (input: { q: string; mode?: string }) => Promise<string[]>;
    categories: () => Promise<string[]>;
  };
  git: CavalGitApi;
  preload: CavalPreloadApi;
  cad: CavalCadApi;
  roboticsLibrary?: CavalRoboticsLibraryApi;
  schematic: CavalSchematicApi;
  window: CavalWindowApi;
}

declare global {
  interface Window {
    caval: CavalBridge;
  }
}

export {};
