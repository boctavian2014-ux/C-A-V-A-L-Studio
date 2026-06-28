import { contextBridge, ipcRenderer } from "electron";

export interface CavalOpenedFile {
  path: string;
  label: string;
  language: string;
  content: string;
}

export interface CavalWorkspaceFolder {
  path: string;
  files: CavalOpenedFile[];
}

export interface CavalSaveRequest {
  path?: string;
  content: string;
  saveAs?: boolean;
}

export interface CavalChatRequest {
  message: string;
  model: string;
  mode: "ask" | "plan";
  context?: {
    filePath?: string;
    fileContent?: string;
  };
}

export interface CavalChatResponse {
  ok: boolean;
  provider: "cloud" | "ollama" | "none";
  content: string;
  error?: string;
}

export interface CavalModelCatalogEntry {
  id: string;
  label: string;
  tier: "auto" | "free" | "paid";
  source: "caval" | "local" | "byok" | "openrouter";
  provider: string;
  contextWindow: number;
  color: string;
  description?: string;
  isAuto?: boolean;
}

export interface CavalModelCatalog {
  auto: CavalModelCatalogEntry[];
  free: CavalModelCatalogEntry[];
  paid: CavalModelCatalogEntry[];
  coding: CavalModelCatalogEntry[];
  all: CavalModelCatalogEntry[];
  fetchedAt: number;
}

export interface CavalChatStreamRequest {
  message: string;
  model: string;
  mode?: "ask" | "plan" | "code" | "architect" | "debug";
  streamId: string;
  workspaceRoot?: string;
  messages?: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  /** Force OpenRouter json_object — Engineering AI */
  jsonMode?: boolean;
  maxTokens?: number;
  temperature?: number;
  /** Override provider timeout (Engineering JSON uses 120s) */
  timeoutMs?: number;
  scaffoldMode?: boolean;
  context?: {
    filePath?: string;
    fileContent?: string;
    projectContext?: string;
    mentions?: string[];
    attachments?: Array<{ path: string; name: string; content: string }>;
  };
}

export type ChatActivityPhase =
  | "prepare"
  | "route"
  | "connect"
  | "think"
  | "write";

export type MultiAgentPhase =
  | "memory"
  | "integrate"
  | "context"
  | "orchestrator"
  | "decompose"
  | "subagent"
  | "merge"
  | "supervisor"
  | "compose";

export interface CavalStreamChunk {
  streamId: string;
  type: "meta" | "delta" | "done" | "error" | "tool" | "status" | "reasoning" | "multiagent" | "reasoning-brief";
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
  multiAgentPhase?: MultiAgentPhase;
  status?: "active" | "done";
  label?: string;
  detail?: string;
  goal?: string;
  approach?: string;
  modules?: string[];
  reasoningBrief?: { goal: string; approach: string; modules: string[] };
  pipelineRecapMeta?: {
    taskCount: number;
    fastPipeline: boolean;
    pendingIssues: string[];
    devTools?: Record<string, unknown>;
    supervisor?: { approved: boolean; summary: string; issues: unknown[] };
  };
  composeText?: string;
}

export interface CavalChatPrepareRequest {
  workspaceRoot: string;
  objectiveDraft: string;
  model: string;
  draftHash: string;
  activeFile?: string;
  openFiles?: string[];
}

export interface CavalChatPrepareResult {
  ok: boolean;
  draftHash: string;
  warmContextReady: boolean;
  resolvedModelHint?: string;
  partialPlanPreview?: string;
  tokenId?: string;
  error?: string;
}

export interface CavalComposerResult {
  ok: boolean;
  phase: "completed" | "awaiting_suggestions" | "awaiting_review" | "failed";
  changedFiles: string[];
  rolledBack: boolean;
  diagnostics: Array<{ level: string; source: string; message: string; file?: string }>;
  suggestions?: Record<string, unknown>;
  review?: Record<string, unknown>;
  plan?: Record<string, unknown>;
  patchSet?: Record<string, unknown>;
}

export interface CavalMobileBuildError {
  matched: boolean;
  pattern?: string;
  explanation: string;
  suggestedCommands: string[];
  canAutoFix: boolean;
}

export interface CavalLogicFlowExplainRequest {
  nodeId: "suggestions" | "composer" | "review" | "debug";
  label: string;
  description: string;
  context?: {
    composerPhase?: "completed" | "awaiting_suggestions" | "awaiting_review" | "failed";
    workspaceRoot?: string;
  };
}

export interface CavalLogicFlowExplainResponse {
  ok: boolean;
  content: string;
  error?: string;
}

export interface CavalLogicFlowPipelineStep {
  nodeId: "suggestions" | "composer" | "review" | "debug";
  edgeId?: string | null;
}

export interface CavalAgentGoal {
  action: "publish";
  version: string;
  platforms: Array<"android" | "ios" | "ota">;
  notes?: string;
  mode?: "human-in-loop" | "auto";
  sandbox?: boolean;
  dryRun?: boolean;
  requireConfirmationFor?: Array<"publish" | "credentials" | "compose" | "review">;
}

export interface CavalAgentPlanStep {
  id: string;
  type: "suggest" | "compose" | "build" | "test" | "review" | "publish" | "manual";
  label: string;
  meta?: Record<string, unknown>;
  requiresConfirmation?: boolean;
}

export interface CavalAgentCreatePlanResult {
  ok: boolean;
  plan: CavalAgentPlanStep[];
  error?: string;
}

export interface CavalAgentExecuteStepResult {
  ok: boolean;
  reason?: string;
  detail?: unknown;
  output?: unknown;
}

export interface CavalPipelineEvent {
  type: string;
  timestamp: number;
  [key: string]: unknown;
}

contextBridge.exposeInMainWorld("caval", {
  version: "0.1.0",
  productName: "Caval Studio",
  ready: () => ipcRenderer.send("caval:renderer-ready"),
  onMenuCommand: (callback: (command: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, command: string) => callback(command);
    ipcRenderer.on("caval:menu-command", listener);
    return () => ipcRenderer.removeListener("caval:menu-command", listener);
  },
  onFileOpened: (callback: (file: CavalOpenedFile) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, file: CavalOpenedFile) => callback(file);
    ipcRenderer.on("caval:file-opened", listener);
    return () => ipcRenderer.removeListener("caval:file-opened", listener);
  },
  onFolderOpened: (callback: (folder: CavalWorkspaceFolder) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, folder: CavalWorkspaceFolder) => callback(folder);
    ipcRenderer.on("caval:folder-opened", listener);
    return () => ipcRenderer.removeListener("caval:folder-opened", listener);
  },
  saveFile: (request: CavalSaveRequest) => ipcRenderer.invoke("caval:save-file", request),
  engineering: {
    saveFile: (projectPath: string, file: { name: string; content: string }) =>
      ipcRenderer.invoke("engineering:saveFile", projectPath, file),
    saveAll: (projectPath: string, files: { name: string; content: string }[]) =>
      ipcRenderer.invoke("engineering:saveAll", projectPath, files),
    exportCart: (
      parts: {
        name: string;
        qty: number;
        unitPrice: number;
        currency: string;
        shop: string;
        shopUrl: string;
        substitute?: string;
      }[],
      projectPath: string | null
    ) => ipcRenderer.invoke("engineering:exportCart", parts, projectPath),
    openExternal: (url: string) =>
      ipcRenderer.invoke("engineering:openExternal", url),
  },
  chat: (request: CavalChatRequest) => ipcRenderer.invoke("caval:ai-chat", request),
  modelsList: () =>
    ipcRenderer.invoke("caval:models-list") as Promise<{ ok: boolean; catalog?: CavalModelCatalog }>,
  modelsRefresh: () =>
    ipcRenderer.invoke("caval:models-refresh") as Promise<{ ok: boolean; catalog?: CavalModelCatalog }>,
  chatStream: (request: CavalChatStreamRequest, onChunk: (chunk: CavalStreamChunk) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, chunk: CavalStreamChunk) => {
      if (chunk.streamId === request.streamId) {
        onChunk(chunk);
      }
    };
    ipcRenderer.on("caval:ai-stream-chunk", listener);
    const cleanup = () => ipcRenderer.removeListener("caval:ai-stream-chunk", listener);
    void ipcRenderer.invoke("caval:ai-chat-stream", request).then((result: { ok: boolean }) => {
      if (!result.ok) cleanup();
    });
    return cleanup;
  },
  abortChatStream: (streamId: string) =>
    ipcRenderer.invoke("caval:ai-stream-abort", streamId) as Promise<{ ok: boolean }>,
  aiComplete: (request: {
    model: string;
    intent?: string;
    capability?: string;
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    workspaceRoot?: string;
    requestId?: string;
    apiKeys?: Record<string, string>;
    jsonMode?: boolean;
    maxTokens?: number;
    temperature?: number;
    /** Override provider timeout (Engineering JSON uses 120s) */
    timeoutMs?: number;
  }) =>
    ipcRenderer.invoke("caval:ai-complete", request) as Promise<
      | { ok: true; text: string; resolvedModel: string; provider: string }
      | { ok: false; error: string }
    >,
  resolveModel: (input: { model: string; intent?: string }) =>
    ipcRenderer.invoke("caval:resolve-model", input) as Promise<{
      ok: boolean;
      resolved?: { modelId: string; provider: string; reason: string };
    }>,
  composerRun: (request: {
    objective: string;
    mode?: "ask" | "plan";
    skipSuggestions?: boolean;
    skipReview?: boolean;
    suggestionSessionId?: string;
    reviewSessionId?: string;
    approvedAlternativeId?: string;
    runBuild?: boolean;
    runTests?: boolean;
  }) => ipcRenderer.invoke("caval:composer-run", request) as Promise<CavalComposerResult>,
  suggestionsApprove: (input: { sessionId: string; alternativeId?: string }) =>
    ipcRenderer.invoke("caval:suggestions-approve", input),
  suggestionsProceed: (input: { sessionId: string; objective: string; alternativeId?: string }) =>
    ipcRenderer.invoke("caval:suggestions-proceed", input) as Promise<CavalComposerResult>,
  reviewAction: (input: {
    action: "acceptAll" | "rejectAll" | "acceptFile" | "rejectFile" | "acceptHunk" | "rejectHunk" | "acceptLine" | "rejectLine" | "askAIToRevise";
    targetId?: string;
  }) => ipcRenderer.invoke("caval:review-action", input),
  reviewApply: (input: { sessionId: string; objective: string }) =>
    ipcRenderer.invoke("caval:review-apply", input) as Promise<CavalComposerResult>,
  logicflowExplainNode: (request: CavalLogicFlowExplainRequest) =>
    ipcRenderer.invoke("caval:logicflow-explain-node", request) as Promise<CavalLogicFlowExplainResponse>,
  onLogicFlowPipelineStep: (callback: (step: CavalLogicFlowPipelineStep) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, step: CavalLogicFlowPipelineStep) => callback(step);
    ipcRenderer.on("caval:logicflow-pipeline-step", listener);
    return () => ipcRenderer.removeListener("caval:logicflow-pipeline-step", listener);
  },
  onPipelineEvent: (callback: (event: CavalPipelineEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, pipelineEvent: CavalPipelineEvent) => callback(pipelineEvent);
    ipcRenderer.on("caval:pipeline-event", listener);
    return () => ipcRenderer.removeListener("caval:pipeline-event", listener);
  },
  suggestDebugFix: (input: { message: string; nodeId?: string; meta?: Record<string, unknown> }) =>
    ipcRenderer.invoke("caval:debug-suggest-fix", input) as Promise<{ explanation: string; commands: string[]; autoApply: boolean }>,
  replayTool: (input: { toolCallId: string; tool: string; input?: unknown; confirm: boolean }) =>
    ipcRenderer.invoke("caval:tool-replay", input) as Promise<{ ok: boolean; output?: unknown; error?: string }>,
  agentCreatePlan: (goal: CavalAgentGoal) =>
    ipcRenderer.invoke("caval:agent-create-plan", goal) as Promise<CavalAgentCreatePlanResult>,
  agentExecuteStep: (input: {
    step: CavalAgentPlanStep;
    confirmed: boolean;
    autoApply?: boolean;
    dryRun?: boolean;
    sandbox?: boolean;
  }) => ipcRenderer.invoke("caval:agent-execute-step", input) as Promise<CavalAgentExecuteStepResult>,
  agentAbort: () => ipcRenderer.invoke("caval:agent-abort") as Promise<{ ok: boolean }>,
  agentSaveAudit: (audit: Record<string, unknown>) =>
    ipcRenderer.invoke("caval:agent-save-audit", audit) as Promise<{ ok: boolean; path?: string; error?: string }>,
  sandboxRun: (input: { toolCallId: string; tool: string; input?: unknown; confirm?: boolean }) =>
    ipcRenderer.invoke("caval:sandbox-run", input) as Promise<{ ok: boolean; output?: unknown; error?: string }>,
  applyFixAndRerun: (input: { message: string; commands: string[] }) =>
    ipcRenderer.invoke("caval:apply-fix-rerun", input) as Promise<{ ok: boolean; error?: string }>,
  startMobileBuild: (input: { platform: "android" | "ios" | "ota" }) =>
    ipcRenderer.invoke("caval:mobile-build-start", input) as Promise<{ ok: boolean; started?: boolean; error?: string }>,
  cancelMobileBuild: () => ipcRenderer.invoke("caval:mobile-build-cancel") as Promise<{ ok: boolean }>,
  fixMobileBuild: (input: { command: string }) =>
    ipcRenderer.invoke("caval:mobile-build-fix", input) as Promise<{ ok: boolean }>,
  onMobileBuildData: (callback: (line: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, line: string) => callback(line);
    ipcRenderer.on("caval:mobile-build-data", listener);
    return () => ipcRenderer.removeListener("caval:mobile-build-data", listener);
  },
  onMobileBuildError: (callback: (analysis: CavalMobileBuildError) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, analysis: CavalMobileBuildError) => callback(analysis);
    ipcRenderer.on("caval:mobile-build-error", listener);
    return () => ipcRenderer.removeListener("caval:mobile-build-error", listener);
  },
  onMobileBuildComplete: (callback: (result: { ok: boolean }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, result: { ok: boolean }) => callback(result);
    ipcRenderer.on("caval:mobile-build-complete", listener);
    return () => ipcRenderer.removeListener("caval:mobile-build-complete", listener);
  },
  onMobileBuildStep: (callback: (step: { stepId: string; status: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, step: { stepId: string; status: string }) => callback(step);
    ipcRenderer.on("caval:mobile-build-step", listener);
    return () => ipcRenderer.removeListener("caval:mobile-build-step", listener);
  },
  contextIndex: () => ipcRenderer.invoke("caval:context-index") as Promise<{ ok: boolean; documentCount?: number }>,
  contextSearch: (input: { query: string; limit?: number }) =>
    ipcRenderer.invoke("caval:context-search", input) as Promise<{ ok: boolean; results?: unknown[] }>,
  workspaceOpen: (folderPath: string) =>
    ipcRenderer.invoke("caval:workspace-open", folderPath) as Promise<{ ok: boolean; path?: string; error?: string; cached?: boolean }>,
  workspaceSync: (folderPath: string) =>
    ipcRenderer.invoke("caval:workspace-sync", folderPath) as Promise<{ ok: boolean; path?: string }>,
  zlPrepare: (signals: {
    workspaceRoot: string;
    objectiveDraft?: string;
    activeFile?: string;
    openFiles?: string[];
  }) => ipcRenderer.invoke("caval:zl-prepare", signals) as Promise<{ ok: boolean; tokenId?: string }>,
  zlCancel: (tokenId: string) => ipcRenderer.invoke("caval:zl-cancel", tokenId) as Promise<{ ok: boolean }>,
  zlPanelOpen: (input: {
    workspaceRoot?: string;
    objectiveDraft?: string;
    activeFile?: string;
    openFiles?: string[];
  }) => ipcRenderer.invoke("caval:zl-panel-open", input) as Promise<{ ok: boolean; tokenId?: string }>,
  zlSnapshot: (input?: { workspaceRoot?: string; objectiveDraft?: string }) =>
    ipcRenderer.invoke("caval:zl-snapshot", input) as Promise<{ ok: boolean; snapshot?: unknown }>,
  zlCompleteChat: (signals: {
    workspaceRoot: string;
    objectiveDraft?: string;
    activeFile?: string;
    openFiles?: string[];
    selectedModel?: string;
  }) =>
    ipcRenderer.invoke("caval:zl-complete-chat", signals) as Promise<{
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
    }>,
  chatPrepare: (input: CavalChatPrepareRequest) =>
    ipcRenderer.invoke("caval:chat-prepare", input) as Promise<CavalChatPrepareResult>,
  settingsSave: (settings: Record<string, string>) =>
    ipcRenderer.invoke("caval:settings-save", settings) as Promise<{ ok: boolean }>,
  settingsLoad: () => ipcRenderer.invoke("caval:settings-load") as Promise<{ ok: boolean; settings?: Record<string, string> }>,
  billingUserId: () =>
    ipcRenderer.invoke("caval:billing-user-id") as Promise<{ ok: boolean; userId?: string }>,
  billingEntitlements: () =>
    ipcRenderer.invoke("caval:billing-entitlements") as Promise<{
      ok: boolean;
      plan?: string;
      status?: string;
      entitlements?: string[];
      expiresAt?: string;
      error?: string;
    }>,
  billingCheckout: (input: { email: string }) =>
    ipcRenderer.invoke("caval:billing-checkout", input) as Promise<{ ok: boolean; url?: string; error?: string }>,
  secretsGet: () =>
    ipcRenderer.invoke("caval:secrets-get") as Promise<{ ok: boolean; secrets?: Record<string, string> }>,
  secretsSet: (secrets: Record<string, string>) =>
    ipcRenderer.invoke("caval:secrets-set", secrets) as Promise<{ ok: boolean }>,
  mcpList: () => ipcRenderer.invoke("caval:mcp-list") as Promise<{ ok: boolean; servers?: unknown[] }>,
  mcpStart: (serverId: string) => ipcRenderer.invoke("caval:mcp-start", serverId),
  mcpStop: (serverId: string) => ipcRenderer.invoke("caval:mcp-stop", serverId),
  toolExecute: (input: { name: string; arguments: Record<string, unknown> }) =>
    ipcRenderer.invoke("caval:tool-execute", input),
  autocomplete: (input: { prefix: string; filePath: string; language: string }) =>
    ipcRenderer.invoke("caval:autocomplete", input) as Promise<{ ok: boolean; suggestion?: string }>,
  startTerminal: () => ipcRenderer.invoke("caval:terminal-start"),
  writeTerminal: (data: string) => ipcRenderer.invoke("caval:terminal-write", data),
  stopTerminal: () => ipcRenderer.invoke("caval:terminal-stop"),
  onTerminalData: (callback: (data: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: string) => callback(data);
    ipcRenderer.on("caval:terminal-data", listener);
    return () => ipcRenderer.removeListener("caval:terminal-data", listener);
  },

  fs: {
    pickFiles: () => ipcRenderer.invoke("fs:pickFiles") as Promise<string[] | null>,
    openFolder: () => ipcRenderer.invoke("fs:openFolder"),
    readTree: (dirPath: string) => ipcRenderer.invoke("fs:readTree", dirPath),
    readFile: (filePath: string) => ipcRenderer.invoke("fs:readFile", filePath),
    writeFile: (filePath: string, content: string) => ipcRenderer.invoke("fs:writeFile", filePath, content),
    createFile: (filePath: string) => ipcRenderer.invoke("fs:createFile", filePath),
    createDir: (dirPath: string) => ipcRenderer.invoke("fs:createDir", dirPath),
    rename: (oldPath: string, newPath: string) => ipcRenderer.invoke("fs:rename", oldPath, newPath),
    delete: (targetPath: string) => ipcRenderer.invoke("fs:delete", targetPath),
    reveal: (filePath: string) => ipcRenderer.invoke("fs:reveal", filePath)
  },

  terminal: {
    create: (id: string) => ipcRenderer.invoke("terminal:create", id),
    write: (id: string, data: string) => ipcRenderer.invoke("terminal:write", id, data),
    resize: (id: string, cols: number, rows: number) => ipcRenderer.invoke("terminal:resize", id, cols, rows),
    destroy: (id: string) => ipcRenderer.invoke("terminal:destroy", id),
    onData: (id: string, cb: (data: string) => void) => {
      const channel = `terminal:data:${id}`;
      const listener = (_event: Electron.IpcRendererEvent, data: string) => cb(data);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    }
  },

  git: {
    status: (projectPath: string) => ipcRenderer.invoke("git:status", projectPath),
    diff: (projectPath: string, filePath: string, staged: boolean) =>
      ipcRenderer.invoke("git:diff", projectPath, filePath, staged),
    filePair: (projectPath: string, filePath: string, staged: boolean) =>
      ipcRenderer.invoke("git:filePair", projectPath, filePath, staged) as Promise<{
        original: string;
        modified: string;
        language: string;
      }>,
    revertHunk: (projectPath: string, filePath: string, hunkPatch: string) =>
      ipcRenderer.invoke("git:revertHunk", projectPath, filePath, hunkPatch) as Promise<{
        ok: boolean;
        error?: string;
      }>,
    stage: (projectPath: string, filePath: string) => ipcRenderer.invoke("git:stage", projectPath, filePath),
    unstage: (projectPath: string, filePath: string) => ipcRenderer.invoke("git:unstage", projectPath, filePath),
    stageAll: (projectPath: string) => ipcRenderer.invoke("git:stageAll", projectPath),
    unstageAll: (projectPath: string) => ipcRenderer.invoke("git:unstageAll", projectPath),
    discard: (projectPath: string, filePath: string) => ipcRenderer.invoke("git:discard", projectPath, filePath),
    commit: (projectPath: string, message: string) => ipcRenderer.invoke("git:commit", projectPath, message),
    push: (projectPath: string, setUpstream?: boolean) => ipcRenderer.invoke("git:push", projectPath, setUpstream),
    pull: (projectPath: string) => ipcRenderer.invoke("git:pull", projectPath),
    log: (projectPath: string, limit?: number) => ipcRenderer.invoke("git:log", projectPath, limit),
    branches: (projectPath: string) => ipcRenderer.invoke("git:branches", projectPath),
    checkout: (projectPath: string, branch: string) => ipcRenderer.invoke("git:checkout", projectPath, branch),
    createBranch: (projectPath: string, name: string) => ipcRenderer.invoke("git:createBranch", projectPath, name),
    stash: (projectPath: string, message?: string) => ipcRenderer.invoke("git:stash", projectPath, message),
    stashPop: (projectPath: string) => ipcRenderer.invoke("git:stashPop", projectPath)
  },


  preload: {
    status: () =>
      ipcRenderer.invoke("caval:preload-status") as Promise<{
        enabled: boolean;
        workerReady: boolean;
        workspaceRoot: string | null;
        inFlight: number;
        ollamaReachable: boolean | null;
        cache: {
          entries: Array<{
            modelId: string;
            provider: string;
            stage: string;
            status: string;
            priority: number;
            hitCount: number;
            latencyMs?: number;
          }>;
        };
      }>,
    warm: (modelId: string, stage?: string) =>
      ipcRenderer.invoke("caval:preload-warm", { modelId, stage }) as Promise<{ ok: boolean }>,
    invalidate: () => ipcRenderer.invoke("caval:preload-invalidate") as Promise<{ ok: boolean }>,
    notify: (input: {
      action: string;
      openFiles?: string[];
      activeFile?: string;
      modelId?: string;
    }) => ipcRenderer.invoke("caval:preload-notify", input) as Promise<{ ok: boolean }>,
    subscribe: () => ipcRenderer.send("caval:preload-subscribe"),
    unsubscribe: () => ipcRenderer.send("caval:preload-unsubscribe"),
    onEvent: (callback: (event: { type: string; modelId?: string; stage?: string; message?: string }) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: { type: string; modelId?: string; stage?: string; message?: string }) =>
        callback(payload);
      ipcRenderer.on("caval:preload-event", listener);
      return () => ipcRenderer.removeListener("caval:preload-event", listener);
    }
  },

  window: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    maximize: () => ipcRenderer.invoke("window:maximize"),
    close: () => ipcRenderer.invoke("window:close")
  },

  cad: {
    isCloudOnly: () =>
      ipcRenderer.invoke("cad:isCloudOnly") as Promise<{
        ok: boolean;
        cloudOnly?: boolean;
        defaultUrl?: string;
      }>,
    health: () =>
      ipcRenderer.invoke("cad:health") as Promise<{
        ok: boolean;
        url?: string;
        cloudOnly?: boolean;
        openscadInstalled?: boolean;
        openRouterConfigured?: boolean;
        meshyConfigured?: boolean;
        error?: string;
      }>,
    plan: (input: {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
      latestUserText: string;
      openRouterApiKey?: string;
      meshApiKey?: string;
      previousMeshTaskId?: string;
    }) =>
      ipcRenderer.invoke("cad:plan", input) as Promise<{
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
      }>,
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
    }) =>
      ipcRenderer.invoke("cad:createJob", input) as Promise<{
        ok: boolean;
        jobId?: string;
        status?: string;
        error?: string;
      }>,
    getJob: (input: { jobId: string; cavalId?: string }) =>
      ipcRenderer.invoke("cad:getJob", input) as Promise<{
        ok: boolean;
        jobId?: string;
        status?: string;
        stlUrl?: string | null;
        scad?: string | null;
        error?: string | null;
        dimensions?: { x: number; y: number; z: number } | null;
        meshTaskId?: string | null;
      }>,
    cancelJob: (input: { jobId: string; cavalId?: string }) =>
      ipcRenderer.invoke("cad:cancelJob", input) as Promise<{
        ok: boolean;
        jobId?: string;
        status?: string;
        error?: string;
      }>,
    getJobLogs: (input: { jobId: string; cavalId?: string }) =>
      ipcRenderer.invoke("cad:getJobLogs", input) as Promise<{
        ok: boolean;
        jobId?: string;
        logs?: Array<{ at: string; level: string; event: string; message?: string }>;
        error?: string;
      }>,
    downloadStl: (input: { url: string; defaultName?: string }) =>
      ipcRenderer.invoke("cad:downloadStl", input) as Promise<{
        ok: boolean;
        canceled?: boolean;
        path?: string;
        error?: string;
      }>,
    downloadScad: (input: { content: string; defaultName?: string }) =>
      ipcRenderer.invoke("cad:downloadScad", input) as Promise<{
        ok: boolean;
        canceled?: boolean;
        path?: string;
        error?: string;
      }>,
    installOpenScad: () =>
      ipcRenderer.invoke("cad:installOpenScad") as Promise<{
        ok: boolean;
        installed?: boolean;
        error?: string;
      }>,
  },

  schematic: {
    generateFromCode: (input: {
      workspaceRoot: string;
      files?: string[];
      objective?: string;
      useSample?: boolean;
    }) =>
      ipcRenderer.invoke("schematic:generateFromCode", input) as Promise<{
        ok: boolean;
        graph?: Record<string, unknown>;
        error?: string;
      }>,
    generateCode: (input: {
      workspaceRoot: string;
      graph: Record<string, unknown>;
      delta: Record<string, unknown>;
      skipSuggestions?: boolean;
    }) =>
      ipcRenderer.invoke("schematic:generateCode", input) as Promise<{
        ok: boolean;
        patchSet?: { summary: string; files: Array<{ path: string; patch: string }> };
        composerPhase?: string;
        reviewSessionId?: string;
        suggestionsSessionId?: string;
        error?: string;
      }>,
    explain: (input: {
      graph: Record<string, unknown>;
      nodeId?: string;
      edgeId?: string;
    }) =>
      ipcRenderer.invoke("schematic:explain", input) as Promise<{
        ok: boolean;
        content?: string;
        error?: string;
      }>,
    analyze: (input: { graph: Record<string, unknown> }) =>
      ipcRenderer.invoke("schematic:analyze", input) as Promise<{
        ok: boolean;
        issues?: Array<{ id: string; severity: string; kind: string; message: string }>;
        error?: string;
      }>,
    autoLayout: (input: { graph: Record<string, unknown> }) =>
      ipcRenderer.invoke("schematic:autoLayout", input) as Promise<{
        ok: boolean;
        graph?: Record<string, unknown>;
        error?: string;
      }>
  }
});
