import { contextBridge, ipcRenderer } from "electron";
import { gitApi } from "./preload-git";
import { problemsApi } from "./preload-problems";
import { tasksApi } from "./preload-tasks";
import { previewApi } from "./preload-preview";
import { cavalTerminalPreload } from "./preload-terminal";

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
  mode?: "ask" | "plan" | "code" | "agentic" | "architect" | "debug";
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
  /** Skip multi-agent pipeline — direct single-model stream */
  skipMultiAgent?: boolean;
  /** Force merge + supervisor review in Agentic pipeline */
  strictReview?: boolean;
  /** Pas 5.2 — optional IDE snapshot; omit when per-thread toggle is OFF. */
  ideContext?: import("../shared/ai-context-contract").IdeContextPayload;
  /** Pas 6.1 — propose localized diagnostic fix (no disk write). */
  quickFix?: import("../shared/ai-quick-fix-contract").QuickFixRequest;
  /** Pas 6.1 — after renderer accept: emit file_write on timeline only. */
  quickFixAccept?: import("../shared/ai-quick-fix-contract").QuickFixAcceptRequest;
  /** Pas 6.2 — after inline completion Tab accept: emit file_write on timeline only. */
  timelineFileWrite?: import("../shared/ai-inline-completion-contract").TimelineFileWriteRequest;
  /** Pas 6.3 — read-only explain on hover / selection. */
  explain?: import("../shared/ai-explain-contract").ExplainRequest;
  /** Pas 7c.1 — read-only terminal output explain. */
  terminalExplain?: import("../shared/ai-terminal-contract").TerminalExplainRequest;
  /** Pas 7c.2 — propose-only terminal command suggestions. */
  terminalSuggest?: import("../shared/ai-terminal-contract").TerminalSuggestRequest;
  /** Pas 6.5 — gated multi-file refactor propose. */
  refactor?: import("../shared/ai-refactor-contract").RefactorRequest;
  /** Pas 7a.2 — UI thread id; used as conversation_id when persisting the assistant message. */
  conversationId?: string;
  /** Pas 7e.2 — UI assistant message id aligned with SQLite messages.id. */
  assistantMessageId?: string;
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
  | "modelOrch"
  | "orchestrator"
  | "decompose"
  | "subagent"
  | "merge"
  | "supervisor"
  | "compose"
  | "userSim"
  | "security"
  | "performance";

export interface CavalStreamChunk {
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
  multiAgentPhase?: MultiAgentPhase;
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
  /** Pas 5.4 — sanitized activity row for the assistant bubble timeline. */
  event?: import("../shared/ai-timeline-contract").TimelineEvent;
  /** Pas 6.1 — proposed / accept result for quick fix. */
  quickFix?: import("../shared/ai-quick-fix-contract").QuickFixResult;
  /** Pas 6.3 — read-only explain result. */
  explain?: import("../shared/ai-explain-contract").ExplainResult;
  /** Pas 7c.1 — read-only terminal output explain result. */
  terminalExplain?: import("../shared/ai-terminal-contract").TerminalExplainResult;
  /** Pas 7c.2 — propose-only terminal command suggestions. */
  terminalSuggest?: import("../shared/ai-terminal-contract").TerminalSuggestResult;
  /** Pas 6.5 — multi-file refactor proposal. */
  refactor?: import("../shared/ai-refactor-contract").RefactorResult;
  /** Pas 6.4 — staged file proposals (not on disk until Accept). */
  proposedWrites?: import("../shared/ai-chat-apply-contract").ProposedWrite[];
  proposeStageKey?: string;
  pipelineRecapMeta?: {
    taskCount: number;
    fastPipeline: boolean;
    pendingIssues: string[];
    devTools?: Record<string, unknown>;
    supervisor?: { approved: boolean; summary: string; issues: unknown[] };
    completionGate?: { ok: boolean; issues: Array<{ code: string; message: string }>; suggestedContinueMessage: string };
    deliveryBlocked?: boolean;
  };
  completionGate?: { ok: boolean; issues: Array<{ code: string; message: string }>; suggestedContinueMessage: string };
  deliveryBlocked?: boolean;
  composeText?: string;
  writtenFiles?: string[];
  pauseReason?: "ui-design";
  runId?: string;
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
  productName: "CAVAL Studio",
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
    openExternal: (url: string, origin?: "EXTERNAL_CONTENT") =>
      ipcRenderer.invoke("engineering:openExternal", {
        url,
        origin: origin ?? "EXTERNAL_CONTENT",
      }),
  },
  chat: (request: CavalChatRequest) => ipcRenderer.invoke("caval:ai-chat", request),
  modelsList: () =>
    ipcRenderer.invoke("caval:models-list") as Promise<{ ok: boolean; catalog?: CavalModelCatalog }>,
  modelsRefresh: () =>
    ipcRenderer.invoke("caval:models-refresh") as Promise<{ ok: boolean; catalog?: CavalModelCatalog }>,
  modelsHealth: () =>
    ipcRenderer.invoke("caval:models-health") as Promise<{
      ok: boolean;
      summary?: string;
      models?: Record<string, string>;
      providers?: Record<string, { ok: boolean; error?: string; installed?: string[] }>;
    }>,
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
  cancelOperation: (input: {
    operationId?: string;
    streamId?: string;
    cadJobId?: string;
    workspaceRoot?: string;
    cavalId?: string;
  }) =>
    ipcRenderer.invoke("caval:cancel-operation", input) as Promise<{
      ok: boolean;
      status?: string;
      operationId?: string;
      streamId?: string;
      cadJobId?: string;
      signalAborted?: boolean;
      remoteCancel?: "ok" | "failed" | "skipped";
      error?: string;
    }>,
  onPipelineVerifyStatus: (
      callback: (payload: {
        runId: string;
        streamId?: string;
        workspaceRoot: string;
        ok: boolean;
        summary: string;
        issues: Array<{ code: string; message: string }>;
        verifyRan: boolean;
      }) => void
  ) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      callback(payload as {
        runId: string;
        streamId?: string;
        workspaceRoot: string;
        ok: boolean;
        summary: string;
        issues: Array<{ code: string; message: string }>;
        verifyRan: boolean;
      });
    };
    ipcRenderer.on("caval:pipeline-verify-status", listener);
    return () => ipcRenderer.removeListener("caval:pipeline-verify-status", listener);
  },
  workspaceSessionReset: () =>
    ipcRenderer.invoke("caval:workspace-session-reset") as Promise<{ ok: boolean }>,
  pipelineResume: (input: {
    runId: string;
    streamId: string;
    uiPreferences: string;
    workspaceRoot: string;
    model: string;
    strictReview?: boolean;
  }) => ipcRenderer.invoke("caval:pipeline-resume", input) as Promise<{ ok: boolean; started?: boolean }>,
  pipelineResumeStream: (
    input: {
      runId: string;
      streamId: string;
      uiPreferences: string;
      workspaceRoot: string;
      model: string;
      strictReview?: boolean;
    },
    onChunk: (chunk: CavalStreamChunk) => void
  ) => {
    const listener = (_event: Electron.IpcRendererEvent, chunk: CavalStreamChunk) => {
      if (chunk.streamId !== input.streamId) return;
      onChunk(chunk);
      if (chunk.type === "done" || chunk.type === "error") cleanup();
    };
    ipcRenderer.on("caval:ai-stream-chunk", listener);
    const cleanup = () => ipcRenderer.removeListener("caval:ai-stream-chunk", listener);
    void ipcRenderer.invoke("caval:pipeline-resume", input).then((result: { ok: boolean }) => {
      if (!result.ok) cleanup();
    });
    return cleanup;
  },
  onWorkspaceSessionReset: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("caval:workspace-session-reset", listener);
    return () => ipcRenderer.removeListener("caval:workspace-session-reset", listener);
  },
  onRendererRecovered: (
    callback: (payload: { reason: string; recoveredAt: string }) => void
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { reason: string; recoveredAt: string }
    ) => callback(payload);
    ipcRenderer.on("caval:renderer-recovered", listener);
    return () => ipcRenderer.removeListener("caval:renderer-recovered", listener);
  },
  getRecentPipelineCompletion: (workspaceRoot: string) =>
    ipcRenderer.invoke("caval:pipeline-recent-completion", workspaceRoot) as Promise<{
      ok: boolean;
      completion?: {
        runId: string;
        writtenFiles: string[];
        composeText?: string;
        pipelineRecapMeta?: unknown;
        finishedAt: string;
      } | null;
    }>,
  chatApplyAccept: (input: {
    stageKey?: string;
    writes?: import("../shared/ai-chat-apply-contract").ProposedWrite[];
    conversationId?: string;
    messageId?: string;
    streamId?: string;
  }) =>
    ipcRenderer.invoke("caval:chat-apply-accept", input) as Promise<{
      ok: boolean;
      applied: string[];
      writes?: import("../shared/ai-chat-apply-contract").ProposedWrite[];
      errors?: string[];
      error?: string;
    }>,
  chatApplyReject: (input: { stageKey?: string }) =>
    ipcRenderer.invoke("caval:chat-apply-reject", input) as Promise<{ ok: boolean }>,
  chatApplyRevertNew: (input: {
    writes: import("../shared/ai-chat-apply-contract").ProposedWrite[];
  }) =>
    ipcRenderer.invoke("caval:chat-apply-revert-new", input) as Promise<{
      ok: boolean;
      deleted: string[];
      errors?: string[];
    }>,
  aiHistory: {
    listConversations: (params?: import("../shared/ai-history-contract").ListConversationsParams) =>
      ipcRenderer.invoke("caval:ai-history-list", params) as Promise<{
        ok: boolean;
        conversations?: import("../shared/ai-history-contract").ConversationSummary[];
        error?: string;
      }>,
    getConversation: (conversationId: string) =>
      ipcRenderer.invoke("caval:ai-history-get", { conversationId }) as Promise<{
        ok: boolean;
        conversation?: import("../shared/ai-history-contract").AiHistoryConversationPayload;
        error?: string;
      }>,
    getMessageDetails: (messageId: string) =>
      ipcRenderer.invoke("caval:ai-history-message-details", { messageId }) as Promise<{
        ok: boolean;
        timeline?: import("../shared/ai-timeline-contract").TimelineEvent[];
        writtenFiles?: import("../shared/ai-history-contract").HistoryWrittenFile[];
        error?: string;
      }>,
    deleteConversation: (conversationId: string) =>
      ipcRenderer.invoke("caval:ai-history-delete", { conversationId }) as Promise<{
        ok: boolean;
        error?: string;
      }>,
    revertWrittenFile: (writtenFileId: string) =>
      ipcRenderer.invoke("caval:ai-history-revert-written", { writtenFileId }) as Promise<{
        ok: boolean;
        error?: string;
        filePath?: string;
      }>,
    exportConversation: (req: {
      conversationId: string;
      format: import("../shared/ai-history-contract").ExportFormat;
      acknowledgeLarge?: boolean;
    }) =>
      ipcRenderer.invoke("caval:ai-history-export", req) as Promise<
        import("../shared/ai-history-contract").ExportResult
      >,
    setFeedback: (
      messageId: string,
      rating: "positive" | "negative",
      comment?: string,
      streamId?: string
    ) =>
      ipcRenderer.invoke("caval:ai-history-set-feedback", {
        messageId,
        rating,
        comment,
        streamId,
      }) as Promise<{
        ok: boolean;
        feedback?: import("../shared/ai-history-contract").MessageFeedback;
        error?: string;
      }>,
    getFeedback: (messageId: string, streamId?: string) =>
      ipcRenderer.invoke("caval:ai-history-get-feedback", { messageId, streamId }) as Promise<{
        ok: boolean;
        feedback?: import("../shared/ai-history-contract").MessageFeedback | null;
        error?: string;
      }>,
    clearFeedback: (messageId: string, streamId?: string) =>
      ipcRenderer.invoke("caval:ai-history-clear-feedback", { messageId, streamId }) as Promise<{
        ok: boolean;
        error?: string;
      }>,
  },
  aiSettings: {
    getSettings: () =>
      ipcRenderer.invoke("caval:ai-settings-get") as Promise<{
        ok: boolean;
        settings?: import("../shared/ai-settings-contract").AiSettings;
        error?: string;
      }>,
    updateSettings: (partial: Partial<import("../shared/ai-settings-contract").AiSettings>) =>
      ipcRenderer.invoke("caval:ai-settings-update", { partial }) as Promise<{
        ok: boolean;
        settings?: import("../shared/ai-settings-contract").AiSettings;
        error?: string;
      }>,
    resetSettings: () =>
      ipcRenderer.invoke("caval:ai-settings-reset") as Promise<{
        ok: boolean;
        settings?: import("../shared/ai-settings-contract").AiSettings;
        error?: string;
      }>,
  },
  workspaceIndex: {
    getSummary: () =>
      ipcRenderer.invoke("caval:workspace-index-summary") as Promise<{
        ok: boolean;
        summary?: import("../shared/workspace-index-contract").WorkspaceIndexSummary;
        error?: string;
      }>,
    getIndex: () =>
      ipcRenderer.invoke("caval:workspace-index-get") as Promise<{
        ok: boolean;
        index?: import("../shared/workspace-index-contract").WorkspaceIndex;
        error?: string;
      }>,
    refresh: () =>
      ipcRenderer.invoke("caval:workspace-index-refresh") as Promise<{
        ok: boolean;
        index?: import("../shared/workspace-index-contract").WorkspaceIndex;
        summary?: import("../shared/workspace-index-contract").WorkspaceIndexSummary;
        error?: string;
      }>,
  },
  workspaceSearch: {
    query: (query: import("../shared/workspace-search-contract").WorkspaceSearchQuery) =>
      ipcRenderer.invoke(
        "caval:workspace-search-query",
        query
      ) as Promise<import("../shared/workspace-search-contract").WorkspaceSearchResponse>,
  },
  getReasoningLayerConfig: (workspaceRoot?: string) =>
    ipcRenderer.invoke("multiagent:reasoning-config", workspaceRoot) as Promise<{
      ok: boolean;
      config?: import("../../ai/composer/multi-agent/types").ReasoningLayerConfig;
    }>,
  aiComplete: (request: {
    model: string;
    intent?: string;
    capability?: string;
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    workspaceRoot?: string;
    requestId?: string;
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
  workspaceOpen: (folderPath: string, options?: { source?: 'folder' | 'clone' }) =>
    ipcRenderer.invoke("caval:workspace-open", folderPath, options) as Promise<{ ok: boolean; path?: string; error?: string; cached?: boolean }>,
  workspaceSync: (folderPath: string) =>
    ipcRenderer.invoke("caval:workspace-sync", folderPath) as Promise<{ ok: boolean; path?: string }>,
  workspace: {
    listRecent: () =>
      ipcRenderer.invoke("workspace:list-recent") as Promise<{
        ok: boolean;
        entries?: Array<{
          path: string;
          name: string;
          lastOpened: string;
          source: 'folder' | 'clone';
        }>;
      }>,
    removeRecent: (folderPath: string) =>
      ipcRenderer.invoke("workspace:remove-recent", folderPath) as Promise<{
        ok: boolean;
        entries?: Array<{
          path: string;
          name: string;
          lastOpened: string;
          source: 'folder' | 'clone';
        }>;
      }>,
    createOnDesktop: (input: { name: string }) =>
      ipcRenderer.invoke("workspace:createOnDesktop", input) as Promise<{
        ok: boolean;
        path?: string;
        location?: "desktop" | "downloads";
        error?: string;
      }>,
  },
  getWorkspaceBootstrap: (workspaceRoot: string) =>
    ipcRenderer.invoke("caval:workspace-bootstrap", workspaceRoot) as Promise<{
      ok: boolean;
      bootstrap?: string;
    }>,
  workspaceVerify: (
    workspaceRoot: string,
    options?: { autoInstall?: boolean; writtenFiles?: string[] }
  ) =>
    ipcRenderer.invoke("caval:workspace-verify", workspaceRoot, options) as Promise<{
      ok: boolean;
      verify?: {
        ran: boolean;
        summary: string;
        commands: Array<{ command: string; ok: boolean; exitCode: number | null; output: string }>;
      };
      error?: string;
    }>,
  projectHealthCheck: (action: "scan" | "execute") =>
    ipcRenderer.invoke("caval:project-health-check", action) as Promise<{
      ok: boolean;
      snapshot?: {
        packageFound: boolean;
        packageName?: string;
        checks: Array<{
          id: string;
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
    }>,
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
  localAiStatus: () =>
    ipcRenderer.invoke("caval:local-ai-status") as Promise<{
      ok: boolean;
      status?: {
        supported: boolean;
        platform: string;
        installed: boolean;
        running: boolean;
        configuredUrl: string;
        runtimePath?: string;
        models: string[];
        defaultModel: string;
        defaultModelReady: boolean;
        managedByCaval: boolean;
        inProgress: boolean;
        phase: "running" | "starting" | "unavailable";
        lastError?: string;
        policy: string;
      };
      error?: string;
    }>,
  localAiSetup: (input?: { installRuntime?: boolean; pullModel?: boolean; modelName?: string }) =>
    ipcRenderer.invoke("caval:local-ai-setup", input) as Promise<{
      ok: boolean;
      changed?: boolean;
      summary?: string;
      error?: string;
      status?: import("../shared/local-ai-contract").LocalAiStatus;
    }>,
  /** Pas 7f.3 — install Ollama only (requires confirmed: true). */
  localAiInstall: (req: { confirmed: true }) =>
    ipcRenderer.invoke("caval:local-ai-install", req) as Promise<{
      success: boolean;
      error?: string;
      status?: import("../shared/local-ai-contract").LocalAiStatus;
    }>,
  /** Pas 7f.3 — pull model with progress events. */
  localAiPullModel: (req: { modelId: string; confirmed: true }) =>
    ipcRenderer.invoke("caval:local-ai-pull-model", req) as Promise<{
      success: boolean;
      cancelled?: boolean;
      error?: string;
      status?: import("../shared/local-ai-contract").LocalAiStatus;
    }>,
  localAiPullCancel: (modelId: string) =>
    ipcRenderer.invoke("caval:local-ai-pull-cancel", modelId) as Promise<{
      ok: boolean;
      error?: string;
    }>,
  onLocalAiPullProgress: (
    listener: (progress: import("../shared/local-ai-contract").OllamaModelPullProgress) => void
  ): (() => void) => {
    const channel = "caval:local-ai-pull-progress";
    const wrapped = (
      _event: Electron.IpcRendererEvent,
      progress: import("../shared/local-ai-contract").OllamaModelPullProgress
    ) => {
      listener(progress);
    };
    ipcRenderer.on(channel, wrapped);
    return () => {
      ipcRenderer.removeListener(channel, wrapped);
    };
  },
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
    ipcRenderer.invoke("caval:secrets-get") as Promise<{
      ok: boolean;
      providers?: Array<{
        provider: string;
        configured: boolean;
        source: "environment" | "secure-storage" | "none";
        lastValidatedAt: string | null;
      }>;
      configured?: Record<string, boolean>;
      error?: string;
    }>,
  secretsSet: (secrets: Record<string, string>) =>
    ipcRenderer.invoke("caval:secrets-set", secrets) as Promise<{ ok: boolean }>,
  /** Pas 7f.1 — unified AI provider registry (status only; no secret values). */
  aiProvidersList: () =>
    ipcRenderer.invoke("caval:ai-providers-list") as Promise<{
      ok: boolean;
      providers?: import("../shared/ai-provider-contract").AiProviderEntry[];
      preferredProviderId?: import("../shared/ai-provider-contract").AiProviderId;
      encryptionAvailable?: boolean;
      error?: string;
    }>,
  aiProvidersSetPreferred: (input: { providerId: string }) =>
    ipcRenderer.invoke("caval:ai-providers-set-preferred", input) as Promise<{
      ok: boolean;
      preferredProviderId?: import("../shared/ai-provider-contract").AiProviderId;
      error?: string;
    }>,
  /** Pas 7f.2 — live local AI status (sanitized; no paths/process handles). */
  localAiOnStatusChanged: (
    listener: (status: import("../shared/local-ai-contract").LocalAiStatus) => void
  ): (() => void) => {
    const channel = "caval:local-ai-status-changed";
    const wrapped = (
      _event: Electron.IpcRendererEvent,
      status: import("../shared/local-ai-contract").LocalAiStatus
    ) => {
      listener(status);
    };
    ipcRenderer.on(channel, wrapped);
    return () => {
      ipcRenderer.removeListener(channel, wrapped);
    };
  },
  /** Lot C5.5 / 7f.4 — user-initiated key or custom endpoint test. */
  testProviderKey: (input: {
    providerId: string;
    secretKey?: string;
    draft?: { baseUrl?: string; apiKey?: string; modelId?: string };
  }) =>
    ipcRenderer.invoke("caval:test-provider-key", input) as Promise<{
      ok: boolean;
      result: "valid" | "invalid" | "unreachable";
      error?: string;
    }>,
  mcpList: () =>
    ipcRenderer.invoke("caval:mcp-list") as Promise<{
      ok: boolean;
      servers?: unknown[];
      remoteEnabled?: boolean;
    }>,
  mcpEnsureReady: () =>
    ipcRenderer.invoke("caval:mcp-ensure") as Promise<{
      ok: boolean;
      servers?: unknown[];
      remoteEnabled?: boolean;
    }>,
  mcpStart: (serverId: string) => ipcRenderer.invoke("caval:mcp-start", serverId),
  mcpStop: (serverId: string) => ipcRenderer.invoke("caval:mcp-stop", serverId),
  mcpTrustList: () =>
    ipcRenderer.invoke("caval:mcp-trust-list") as Promise<{ ok: boolean; records?: unknown[] }>,
  mcpTrustRevoke: (input?: { serverId?: string }) =>
    ipcRenderer.invoke("caval:mcp-trust-revoke", input) as Promise<{
      ok: boolean;
      records?: unknown[];
      error?: string;
    }>,
  toolExecute: (input: { name: string; arguments: Record<string, unknown> }) =>
    ipcRenderer.invoke("caval:tool-execute", input),
  autocomplete: (input: { prefix: string; filePath: string; language: string }) =>
    ipcRenderer.invoke("caval:autocomplete", input) as Promise<{ ok: boolean; suggestion?: string }>,

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

  terminal: cavalTerminalPreload,

  preview: previewApi,

  git: gitApi,

  problems: problemsApi,

  tasks: tasksApi,


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
        piapiConfigured?: boolean;
        meshWorkerConfigured?: boolean;
        meshConfigured?: boolean;
        error?: string;
      }>,
    plan: (input: {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
      latestUserText: string;
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
    }) =>
      ipcRenderer.invoke("cad:createJob", input) as Promise<{
        ok: boolean;
        jobId?: string;
        status?: string;
        code?: string;
        operationId?: string;
        phase?: string;
        ownerIsCaller?: boolean;
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
    cancelJob: (input: { jobId: string; cavalId?: string; workspaceRoot?: string }) =>
      ipcRenderer.invoke("cad:cancelJob", input) as Promise<{
        ok: boolean;
        jobId?: string;
        status?: string;
        remoteCancel?: "ok" | "failed" | "skipped";
        error?: string;
      }>,
    cancelJobs: (input: { jobIds: string[]; cavalId?: string; workspaceRoot?: string }) =>
      ipcRenderer.invoke("cad:cancelJobs", input) as Promise<{
        ok: boolean;
        partiallyCancelled?: boolean;
        results?: Array<{
          jobId: string;
          ok: boolean;
          remoteCancel?: string;
          error?: string;
        }>;
        error?: string;
      }>,
    heartbeat: (input: { jobId?: string; operationId?: string; workspaceRoot?: string }) =>
      ipcRenderer.invoke("cad:heartbeat", input) as Promise<{ ok: boolean }>,
    getJobLogs: (input: { jobId: string; cavalId?: string }) =>
      ipcRenderer.invoke("cad:getJobLogs", input) as Promise<{
        ok: boolean;
        jobId?: string;
        logs?: Array<{ at: string; level: string; event: string; message?: string }>;
        error?: string;
      }>,
    downloadStl: (input: { url: string; defaultName?: string; cavalId?: string }) =>
      ipcRenderer.invoke("cad:downloadStl", input) as Promise<{
        ok: boolean;
        canceled?: boolean;
        path?: string;
        error?: string;
      }>,
    saveStlBase64: (input: { base64: string; defaultName?: string }) =>
      ipcRenderer.invoke("cad:saveStlBase64", input) as Promise<{
        ok: boolean;
        canceled?: boolean;
        path?: string;
        error?: string;
      }>,
    fetchStl: (input: { url: string; cavalId?: string }) =>
      ipcRenderer.invoke("cad:fetchStl", input) as Promise<{
        ok: boolean;
        base64?: string;
        bytes?: number;
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

  roboticsLibrary: {
    cdnBase: () =>
      ipcRenderer.invoke("roboticsLibrary:cdnBase") as Promise<{ ok: boolean; base?: string }>,
    getCatalog: () =>
      ipcRenderer.invoke("roboticsLibrary:getCatalog") as Promise<{
        ok: boolean;
        catalog?: Record<string, { path: string; format: "scad" | "stl"; tags: string[]; label?: string }>;
        source?: string;
        error?: string;
      }>,
    ensureCached: (relPath: string) =>
      ipcRenderer.invoke("roboticsLibrary:ensureCached", relPath) as Promise<{
        ok: boolean;
        localPath?: string;
        fromCache?: boolean;
        error?: string;
      }>,
    resolve: (standardKey: string) =>
      ipcRenderer.invoke("roboticsLibrary:resolve", standardKey) as Promise<{
        ok: boolean;
        key?: string;
        path?: string;
        format?: "scad" | "stl";
        localPath?: string;
        contentText?: string;
        contentBase64?: string;
        error?: string;
      }>,
    saveStlToProject: (input: { projectPath: string; fileName: string; base64: string }) =>
      ipcRenderer.invoke("roboticsLibrary:saveStlToProject", input) as Promise<{
        ok: boolean;
        savedPath?: string;
        error?: string;
      }>,
    exportZip: (input: {
      projectPath?: string;
      files: Array<{ name: string; base64: string }>;
    }) =>
      ipcRenderer.invoke("roboticsLibrary:exportZip", input) as Promise<{
        ok: boolean;
        savedPath?: string;
        canceled?: boolean;
        error?: string;
      }>,
  },

  search: {
    text: (input: { query: string; caseSensitive?: boolean; maxResults?: number }) =>
      ipcRenderer.invoke("caval:search-text", {
        query: input.query,
        workspaceRoot: "",
        caseSensitive: input.caseSensitive,
        maxResults: input.maxResults,
      }) as Promise<{ ok: boolean; hits?: Array<{ path: string; line: number; column: number; preview: string }>; error?: string }>,
    indexSymbols: () => ipcRenderer.invoke("caval:symbol-index") as Promise<{ ok: boolean; count?: number; error?: string }>,
    gotoDefinition: (input: { filePath: string; symbol: string }) =>
      ipcRenderer.invoke("caval:goto-definition", input) as Promise<{
        ok: boolean;
        location?: { filePath: string; line: number; column: number };
        error?: string;
      }>,
    findReferences: (input: { filePath: string; symbol: string }) =>
      ipcRenderer.invoke("caval:find-references", input) as Promise<{
        ok: boolean;
        references?: Array<{ filePath: string; line: number; column: number }>;
        error?: string;
      }>,
  },

  lsp: {
    start: (languageId: string) => ipcRenderer.invoke("lsp:start", languageId) as Promise<{ ok: boolean; sessionId?: string; error?: string }>,
    stop: (sessionId: string) => ipcRenderer.invoke("lsp:stop", sessionId) as Promise<{ ok: boolean; error?: string }>,
    status: () => ipcRenderer.invoke("lsp:status") as Promise<{ ok: boolean; servers?: unknown[] }>,
  },

  debug: {
    launch: (input?: { program?: string; args?: string[]; cwd?: string }) =>
      ipcRenderer.invoke("debug:launch", input) as Promise<{ ok: boolean; session?: { id: string; pid: number }; error?: string }>,
    stop: (sessionId: string) => ipcRenderer.invoke("debug:stop", sessionId) as Promise<{ ok: boolean; error?: string }>,
    list: () => ipcRenderer.invoke("debug:list") as Promise<{ ok: boolean; sessions?: unknown[] }>,
    launchConfig: () => ipcRenderer.invoke("debug:launch-config") as Promise<{ ok: boolean; config?: { program: string; args?: string[] } }>,
  },

  extensions: {
    list: () => ipcRenderer.invoke("extensions:list") as Promise<{ ok: boolean; extensions?: unknown[] }>,
    register: (manifest: { id: string; name: string; version: string }) =>
      ipcRenderer.invoke("extensions:register", manifest) as Promise<{ ok: boolean; error?: string }>,
    install: (input: { extensionId: string }) =>
      ipcRenderer.invoke("extensions:install", input) as Promise<{
        ok: boolean;
        error?: string;
        extension?: unknown;
      }>,
  },

  openvsx: {
    search: (query: string) =>
      ipcRenderer.invoke("openvsx:search", query) as Promise<{
        ok: boolean;
        extensions?: unknown[];
        error?: string;
      }>,
    popular: () =>
      ipcRenderer.invoke("openvsx:popular") as Promise<{
        ok: boolean;
        extensions?: unknown[];
        error?: string;
      }>,
    install: (input: { namespace: string; name: string }) =>
      ipcRenderer.invoke("openvsx:install", input) as Promise<{ ok: boolean; error?: string; extension?: unknown }>,
  },

  marketplace: {
    health: () =>
      ipcRenderer.invoke("marketplace:health") as Promise<{ ok: boolean; url?: string }>,
    search: (query: {
      text?: string;
      category?: string;
      sortBy?: string;
      limit?: number;
    }) => ipcRenderer.invoke("marketplace:search", query) as Promise<unknown[]>,
    autocomplete: (input: { q: string; mode?: string }) =>
      ipcRenderer.invoke("marketplace:autocomplete", input) as Promise<string[]>,
    categories: () => ipcRenderer.invoke("marketplace:categories") as Promise<string[]>,
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
