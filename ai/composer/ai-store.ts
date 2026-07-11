import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  createProvider,
  type AIMessage,
  type ApiKeys,
} from '../multi-model/provider';
import type { ModelSelectionId } from '../models/model-catalog';
import { isByokModel, hasOpenRouterKey, checkModelReadiness } from '../models/model-readiness';
import { modeSupportsFileApply } from '../models/model-coding-guide';
import { getAgentMode, isAgenticPipelineMode, AGENT_MODES, type AgentModeId, DEFAULT_CAVAL_CONFIG } from '../modes/agent-modes';
import { resolveEffectiveMode } from '../modes/mode-router';
import { normalizeAgentModeId } from '../modes/intent-detector';
import {
  buildContextMessages,
  buildFastChatMessages,
  parseMentions,
  formatContextSearchResults,
  resolveMentionFiles,
  shouldAttachProjectContext,
} from '../context-engine/context-builder';
import { mergeProjectContextWithBootstrap } from '../context/workspace-bootstrap-shared';
import { isScaffoldContinueRequest } from '../prompts/scaffold-emission-rule';
import {
  buildDeliveryContinueMessage,
  isDeliveryContinueRequest,
} from '../prompts/full-delivery-rule';
import {
  canAutoContinueDelivery,
  isDeliveryIncomplete,
} from './delivery-orchestrator';
import { DEFAULT_FULL_DELIVERY_CONFIG } from './multi-agent/types';
import {
  DEFAULT_SESSION_FOCUS,
  isStaleWorkspace,
  workspaceFolderTitle,
} from './workspace-session';
import { registerWorkspaceChangeHandler } from '../../src/renderer/store/workspace-bridge';
import { assertRendererChatAllowed } from '../safety/renderer-chat-guard';
import { useEditorStore } from '../../src/renderer/store/editor-store';
import { applyUnifiedDiff } from '../../src/shared/diff-utils';
import type { CavalStreamChunk } from '../../src/main/preload';
import {
  type ChatActivityPhase,
  type ChatActivityStep,
  type MultiAgentPhase,
  createInitialActivitySteps,
  markAllActivityDone,
  patchActivityStep,
  formatMultiAgentStatus,
  patchMultiAgentSteps,
  type MultiAgentStepRecord,
} from './chat-activity-types';
import { hashChatDraft } from './chat-prepare';
import type { EngProject } from '../engineering/engineering-generator';
import {
  buildSoftwareHandoffPrompt,
  dispatchOpenCodingChat,
  formatEngineeringContextForCoding,
} from '../engineering/engineering-handoff';
import { applyScaffoldToWorkspace, parseScaffoldFiles } from './scaffold-apply';
import { parseStreamingScaffold } from './scaffold-parser';
import {
  buildFashionMatchingAssistantReply,
  fashionMatchingSeedPrompt,
  isFashionMatchingEngineRequest,
  seedFashionMatchingEngine,
} from './fashion-matching-seed';
import { isLlmRefusal } from '../scaffolds/fashion-matching/detect';
import { getFashionMatchingScaffoldFiles } from '../scaffolds/fashion-matching/manifest';
import { stripArenaChatNoise, formatArenaReasoning } from './chat-display';
import {
  buildEarlyArenaMessage,
  buildFinalRecap,
  type ReasoningBrief,
} from './reasoning-brief';
import type { PipelineRecapMeta } from './multi-agent/types';

export interface ChatAttachment {
  id: string;
  path: string;
  name: string;
  content: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  model?: ModelSelectionId;
  resolvedModel?: string;
  isStreaming?: boolean;
  error?: string;
  diff?: DetectedDiff;
  activitySteps?: ChatActivityStep[];
  reasoning?: string;
  reasoningExpanded?: boolean;
  writtenFiles?: string[];
  multiAgentStatus?: string;
  multiAgentSteps?: MultiAgentStepRecord[];
  reasoningBrief?: ReasoningBrief;
  recap?: string;
}

export interface ChatPrepareState {
  draftHash: string;
  ready: boolean;
  resolvedModelHint?: string;
  warmContextReady: boolean;
  partialPlanPreview?: string;
  updatedAt: number;
}

export interface DetectedDiff {
  filePath: string;
  patch: string;
  original: string;
  modified: string;
  language: string;
  applied: boolean;
  rejected?: boolean;
  /** Snapshot before apply — used for rollback */
  previousContent?: string;
}

export interface ChatThread {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  workspacePath?: string | null;
}

type IncludeMode = 'file' | 'project' | 'selection';

interface CavalWindow {
  caval?: {
    chatStream?: (
      request: {
        message: string;
        model: string;
        mode?: string;
        streamId: string;
        workspaceRoot?: string;
        messages?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
        context?: {
          filePath?: string;
          fileContent?: string;
          projectContext?: string;
          mentions?: string[];
          attachments?: Array<{ path: string; name: string; content: string }>;
        };
        scaffoldMode?: boolean;
        skipMultiAgent?: boolean;
        strictReview?: boolean;
      },
      onChunk: (chunk: CavalStreamChunk) => void
    ) => () => void;
    abortChatStream?: (streamId: string) => Promise<{ ok: boolean }>;
    workspaceSessionReset?: () => Promise<{ ok: boolean }>;
    onWorkspaceSessionReset?: (callback: () => void) => () => void;
    pipelineResume?: (input: {
      runId: string;
      streamId: string;
      uiPreferences: string;
      workspaceRoot: string;
      model: string;
      strictReview?: boolean;
    }) => Promise<{ ok: boolean; started?: boolean }>;
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
    contextSearch?: (input: { query: string; limit?: number }) => Promise<{ ok: boolean; results?: Array<Record<string, unknown>> }>;
    workspaceOpen?: (folderPath: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
    workspaceSync?: (folderPath: string) => Promise<{ ok: boolean; path?: string }>;
    mcpEnsureReady?: () => Promise<{ ok: boolean; servers?: unknown[] }>;
    getWorkspaceBootstrap?: (workspaceRoot: string) => Promise<{ ok: boolean; bootstrap?: string }>;
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
    chatPrepare?: (input: {
      workspaceRoot: string;
      objectiveDraft: string;
      model: string;
      draftHash: string;
      activeFile?: string;
      openFiles?: string[];
    }) => Promise<{
      ok: boolean;
      draftHash: string;
      warmContextReady: boolean;
      resolvedModelHint?: string;
      partialPlanPreview?: string;
      tokenId?: string;
    }>;
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
      };
    }>;
    settingsLoad?: () => Promise<{ ok: boolean; settings?: Record<string, string> }>;
    modelsList?: () => Promise<{ catalog?: { all: Array<{ id: string; label: string; color: string }> } }>;
    resolveModel?: (input: { model: string; intent?: string }) => Promise<{
      ok: boolean;
      resolved?: { modelId: string; provider: string; reason: string };
    }>;
    secretsGet?: () => Promise<{ ok: boolean; secrets?: Record<string, string> }>;
    secretsSet?: (secrets: Record<string, string>) => Promise<{ ok: boolean }>;
    workspaceVerify?: (workspaceRoot: string) => Promise<{
      ok: boolean;
      verify?: {
        ran: boolean;
        summary: string;
        commands: Array<{ command: string; ok: boolean; exitCode: number | null; output: string }>;
      };
      error?: string;
    }>;
    toolExecute?: (input: { name: string; arguments: Record<string, unknown> }) => Promise<{
      ok: boolean;
      output?: unknown;
      error?: string;
    }>;
    fs?: {
      pickFiles?: () => Promise<string[] | null>;
      readFile?: (filePath: string) => Promise<{ ok: boolean; content?: string; error?: string }>;
    };
  };
}

const VERIFY_OUTPUT_MAX = 4096;

function patchMessageInThreads(
  set: (partial: Partial<AIStore> | ((s: AIStore) => Partial<AIStore>)) => void,
  messageId: string,
  patch: (msg: ChatMessage) => ChatMessage
): void {
  set((s) => {
    const messages = s.messages.map((m) => (m.id === messageId ? patch(m) : m));
    const threads = s.threads.map((t) =>
      t.id === s.activeThreadId ? { ...t, messages, updatedAt: Date.now() } : t
    );
    return { messages, threads };
  });
}

function truncateVerifyOutput(text: string): string {
  if (text.length <= VERIFY_OUTPUT_MAX) return text;
  return `${text.slice(0, VERIFY_OUTPUT_MAX)}\n\n… (trunchiat, ${text.length - VERIFY_OUTPUT_MAX} caractere omise)`;
}

function appendChatReportMessage(
  set: (partial: Partial<AIStore> | ((s: AIStore) => Partial<AIStore>)) => void,
  content: string,
  extra?: Partial<ChatMessage>
): void {
  const msg: ChatMessage = {
    id: generateId(),
    role: 'assistant',
    content,
    timestamp: Date.now(),
    ...extra,
  };
  set((s) => {
    const updated = [...s.messages, msg];
    const updatedThreads = s.threads.map((t) =>
      t.id === s.activeThreadId ? { ...t, messages: updated, updatedAt: Date.now() } : t
    );
    return { messages: updated, threads: updatedThreads };
  });
}

function formatVerifyThreadMessage(
  verify: {
    ran: boolean;
    summary: string;
    commands: Array<{ command: string; ok: boolean; exitCode: number | null; output: string }>;
  },
  allOk: boolean
): string {
  if (!verify.ran) {
    return `**Verificare workspace**\n\n${verify.summary}`;
  }
  const sections = verify.commands.map((c) => {
    const status = c.ok ? '✓ ok' : '✗ fail';
    const output = truncateVerifyOutput(c.output.trim() || '(fără output)');
    return `### ${c.command} — ${status} (exit ${c.exitCode ?? 'n/a'})\n\`\`\`\n${output}\n\`\`\``;
  });
  let body = `**Verificare workspace**\n\n${verify.summary}\n\n${sections.join('\n\n')}`;
  if (!allOk) {
    body += '\n\n_Poți cere: fixează erorile de mai sus_';
  }
  return body;
}

interface AIStore {
  selectedModel: ModelSelectionId;
  agentMode: AgentModeId;
  apiKeys: ApiKeys;
  modelLabels: Record<string, string>;
  activeResolvedModel: string | null;
  setModel: (id: ModelSelectionId) => void;
  setAgentMode: (mode: AgentModeId) => void;
  setApiKey: (provider: keyof ApiKeys, key: string) => void;
  loadModelLabels: () => Promise<void>;
  refreshResolvedModel: () => Promise<void>;

  activeThreadId: string;
  threads: ChatThread[];
  messages: ChatMessage[];
  isStreaming: boolean;
  prepareState: ChatPrepareState | null;
  prepareInFlight: boolean;
  includeMode: IncludeMode;
  setIncludeMode: (mode: IncludeMode) => void;
  strictReview: boolean;
  setStrictReview: (enabled: boolean) => void;
  modeSwitchNotice: string | null;
  clearModeSwitchNotice: () => void;
  attachedFiles: ChatAttachment[];
  addAttachments: (paths: string[]) => Promise<void>;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
  newThread: (title?: string) => void;
  selectThread: (id: string) => void;
  deleteThread: (id: string) => void;
  onWorkspaceChanged: (nextPath: string | null) => void;

  sendMessage: (userText: string) => Promise<void>;
  chatPrepareDraft: (input: {
    text: string;
    projectPath: string | null;
    activeFile?: string;
    openFiles?: string[];
  }) => Promise<void>;
  clearPrepareState: () => void;
  stopStreaming: () => void;
  clearChat: () => void;
  applyDiff: (messageId: string) => void;
  rejectDiff: (messageId: string) => void;
  rollbackDiff: (messageId: string) => Promise<void>;

  pendingChatDraft: string | null;
  pendingAutoSend: boolean;
  clearPendingChatDraft: () => void;
  handoffFromEngineering: (input: { project: EngProject; userPrompt: string }) => { ok: true } | { ok: false; error: string };

  runWorkspaceVerifyAndReport: () => Promise<void>;
  runBuildAndReport: () => Promise<void>;
  verifyInFlight: 'none' | 'tests' | 'build';

  deliveryPause: { runId: string; streamId: string } | null;
  submitUiDeliveryPreferences: (prefs: string) => Promise<void>;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createThread(title = 'Chat nou', workspacePath: string | null = null): ChatThread {
  const id = generateId();
  return {
    id,
    title,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    workspacePath,
  };
}

function detectDiff(content: string, activeTabPath: string | null): DetectedDiff | undefined {
  const diffMatch = content.match(/```(?:diff)?\s*\n([\s\S]*?)```/);
  if (!diffMatch) return undefined;
  const patch = diffMatch[1].trim();
  if (!patch.includes('@@')) return undefined;

  const pathMatch =
    /^--- a\/(.+)$/m.exec(patch) ??
    /^--- (.+)$/m.exec(patch);
  const filePath = pathMatch?.[1]?.trim() ?? activeTabPath;
  if (!filePath) return undefined;

  const removedLines = patch.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---')).map((l) => l.slice(1));
  const addedLines = patch.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1));
  if (addedLines.length === 0 && removedLines.length === 0) return undefined;

  const tab = useEditorStore.getState().tabs.find((t) => t.path === filePath);
  return {
    filePath,
    patch,
    original: removedLines.join('\n'),
    modified: addedLines.join('\n'),
    language: tab?.language ?? 'typescript',
    applied: false,
  };
}

function attachmentName(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || filePath;
}

const getCaval = (): CavalWindow['caval'] => (window as unknown as CavalWindow).caval;

/** Nu bloca trimiterea mesajului dacă prefetch-ul depășește limita. */
async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  if (ms <= 0) return fallback;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const persistApiKeys = async (apiKeys: ApiKeys): Promise<void> => {
  await getCaval()?.secretsSet?.(apiKeys as Record<string, string>);
};

const loadApiKeysFromSecrets = async (): Promise<ApiKeys> => {
  const result = await getCaval()?.secretsGet?.();
  return (result?.secrets ?? {}) as ApiKeys;
};

let abortController: AbortController | null = null;
let streamCleanup: (() => void) | null = null;
let activeStreamId: string | null = null;
let prepareTokenId: string | null = null;
let prepareRequestId = 0;
let deliveryWaveIndex = 0;
let resumeAfterUiPrefs: { runId: string; uiPreferences: string } | null = null;

const initialThread = createThread();

export const useAIStore = create<AIStore>()(
  persist(
    (set, get) => ({
      selectedModel: getAgentMode('code').defaultModel,
      agentMode: 'code',
      apiKeys: {},
      modelLabels: {},
      activeResolvedModel: null,
      includeMode: 'project',
      strictReview: false,
      modeSwitchNotice: null,
      attachedFiles: [],
      activeThreadId: initialThread.id,
      threads: [initialThread],
      messages: [],
      isStreaming: false,
      prepareState: null,
      prepareInFlight: false,
      pendingChatDraft: null,
      pendingAutoSend: false,
      deliveryPause: null,
      verifyInFlight: 'none' as const,

      setModel: (id) => {
        set({ selectedModel: id, activeResolvedModel: null });
        void get().refreshResolvedModel();
      },
      setAgentMode: (mode) => {
        const normalized = normalizeAgentModeId(mode);
        const modeDef = getAgentMode(normalized);
        set({ agentMode: normalized, selectedModel: modeDef.defaultModel, activeResolvedModel: null, modeSwitchNotice: null });
        void get().refreshResolvedModel();
      },
      clearModeSwitchNotice: () => set({ modeSwitchNotice: null }),
      setIncludeMode: (mode) => set({ includeMode: mode }),
      setStrictReview: (enabled) => set({ strictReview: enabled }),

      addAttachments: async (paths) => {
        const caval = getCaval();
        const existing = new Set(get().attachedFiles.map((f) => f.path));
        const added: ChatAttachment[] = [];

        for (const filePath of paths) {
          if (existing.has(filePath)) continue;
          let content = '';
          try {
            const result = await caval?.fs?.readFile?.(filePath);
            if (result?.ok && result.content != null) {
              content = result.content;
            }
          } catch {
            content = '';
          }
          added.push({
            id: generateId(),
            path: filePath,
            name: attachmentName(filePath),
            content,
          });
        }

        if (added.length > 0) {
          set((s) => ({ attachedFiles: [...s.attachedFiles, ...added] }));
        }
      },

      removeAttachment: (id) => {
        set((s) => ({ attachedFiles: s.attachedFiles.filter((f) => f.id !== id) }));
      },

      clearAttachments: () => set({ attachedFiles: [] }),

      setApiKey: (provider, key) => {
        set((s) => {
          const apiKeys = { ...s.apiKeys, [provider]: key };
          void persistApiKeys(apiKeys);
          return { apiKeys };
        });
      },

      loadModelLabels: async () => {
        const caval = (window as unknown as CavalWindow).caval;
        const result = await caval?.modelsList?.();
        if (!result?.catalog) return;
        const labels: Record<string, string> = {};
        for (const e of result.catalog.all) labels[e.id] = e.label;
        set({ modelLabels: labels });
        await get().refreshResolvedModel();
      },

      refreshResolvedModel: async () => {
        const { selectedModel, agentMode } = get();
        const caval = (window as unknown as CavalWindow).caval;
        if (!caval?.resolveModel) return;
        const modeDef = getAgentMode(agentMode);
        try {
          const result = await caval.resolveModel({ model: selectedModel, intent: modeDef.intent });
          if (result.ok && result.resolved?.modelId) {
            set({ activeResolvedModel: result.resolved.modelId });
          }
        } catch {
          /* ignore */
        }
      },

      newThread: (title?: string) => {
        const workspacePath = useEditorStore.getState().projectPath;
        const thread = createThread(
          title ?? workspaceFolderTitle(workspacePath),
          workspacePath
        );
        set((s) => ({
          threads: [thread, ...s.threads],
          activeThreadId: thread.id,
          messages: [],
        }));
      },

      onWorkspaceChanged: (nextPath) => {
        if (!DEFAULT_SESSION_FOCUS.singleProjectFocus) return;

        const active = get().threads.find((t) => t.id === get().activeThreadId);
        const alreadyOnWorkspace =
          active?.workspacePath === nextPath && !get().isStreaming && !get().prepareInFlight;
        if (alreadyOnWorkspace) return;

        void getCaval()?.workspaceSessionReset?.();
        get().stopStreaming();
        get().clearPrepareState();
        set({ pendingChatDraft: null, pendingAutoSend: false, attachedFiles: [] });
        useEditorStore.getState().closeAiPreview();

        if (DEFAULT_SESSION_FOCUS.newThreadOnWorkspaceChange) {
          const thread = createThread(workspaceFolderTitle(nextPath), nextPath);
          set((s) => ({
            threads: [thread, ...s.threads],
            activeThreadId: thread.id,
            messages: [],
          }));
        }
      },

      selectThread: (id) => {
        const thread = get().threads.find((t) => t.id === id);
        if (!thread) return;
        set({ activeThreadId: id, messages: thread.messages });
      },

      deleteThread: (id) => {
        set((s) => {
          const threads = s.threads.filter((t) => t.id !== id);
          if (threads.length === 0) {
            const t = createThread();
            return { threads: [t], activeThreadId: t.id, messages: [] };
          }
          const activeThreadId = s.activeThreadId === id ? threads[0].id : s.activeThreadId;
          const active = threads.find((t) => t.id === activeThreadId);
          return { threads, activeThreadId, messages: active?.messages ?? [] };
        });
      },

      clearPrepareState: () => {
        if (prepareTokenId) {
          void getCaval()?.zlCancel?.(prepareTokenId);
          prepareTokenId = null;
        }
        set({ prepareState: null, prepareInFlight: false });
      },

      chatPrepareDraft: async ({ text, projectPath, activeFile, openFiles }) => {
        const trimmed = text.trim();
        if (!trimmed || !projectPath) {
          get().clearPrepareState();
          return;
        }

        const { selectedModel } = get();
        const draftHash = hashChatDraft(trimmed, selectedModel, projectPath);
        const requestId = ++prepareRequestId;

        set({ prepareInFlight: true, prepareState: { draftHash, ready: false, warmContextReady: false, updatedAt: Date.now() } });

        const caval = getCaval();
        const result = await caval?.chatPrepare?.({
          workspaceRoot: projectPath,
          objectiveDraft: trimmed,
          model: selectedModel,
          draftHash,
          activeFile,
          openFiles,
        });

        if (requestId !== prepareRequestId) return;

        if (result?.ok) {
          prepareTokenId = result.tokenId ?? null;
          set({
            prepareInFlight: false,
            prepareState: {
              draftHash: result.draftHash,
              ready: true,
              resolvedModelHint: result.resolvedModelHint,
              warmContextReady: result.warmContextReady,
              partialPlanPreview: result.partialPlanPreview,
              updatedAt: Date.now(),
            },
          });
        } else {
          set({ prepareInFlight: false });
        }
      },

      sendMessage: async (userText) => {
        if (!isDeliveryContinueRequest(userText) && !isScaffoldContinueRequest(userText)) {
          deliveryWaveIndex = 0;
        }
        set({ deliveryPause: null });

        const editorState = useEditorStore.getState();
        const boundWorkspace = editorState.projectPath;

        let {
          selectedModel,
          apiKeys,
          messages,
          includeMode,
          agentMode,
          activeThreadId,
          attachedFiles,
          prepareState,
          strictReview,
        } = get();

        const activeThread = get().threads.find((t) => t.id === activeThreadId);
        if (
          activeThread?.workspacePath != null &&
          activeThread.workspacePath !== boundWorkspace
        ) {
          get().newThread();
          ({
            selectedModel,
            apiKeys,
            messages,
            includeMode,
            agentMode,
            activeThreadId,
            attachedFiles,
            prepareState,
            strictReview,
          } = get());
        }

        const cavalloCfg = DEFAULT_CAVAL_CONFIG.cavalloModes;
        if (!isAgenticPipelineMode(agentMode)) {
          const resolved = resolveEffectiveMode(agentMode, userText, {
            autoSwitch: cavalloCfg?.autoModeSwitch !== false,
            explicitTriggers: cavalloCfg?.explicitTriggers !== false,
          });
          if (resolved.switched && resolved.mode !== agentMode) {
            get().setAgentMode(resolved.mode);
            ({
              selectedModel,
              apiKeys,
              messages,
              includeMode,
              agentMode,
              activeThreadId,
              attachedFiles,
              prepareState,
              strictReview,
            } = get());
            set({
              modeSwitchNotice: `Auto → ${getAgentMode(agentMode).label}${resolved.switchReason ? ` (${resolved.switchReason})` : ''}`,
            });
          }
        }

        const modeDef = getAgentMode(agentMode);
        const attachmentsSnapshot = [...attachedFiles];
        let apiPrompt = userText;
        let fashionSeeded = false;
        let fashionSeedCount = 0;

        if (isFashionMatchingEngineRequest(userText) && editorState.projectPath) {
          const written = await seedFashionMatchingEngine(editorState.projectPath);
          if (written.length > 0) {
            fashionSeeded = true;
            fashionSeedCount = written.length;
            await editorState.refreshTree();
            const sep = editorState.projectPath.includes('\\') ? '\\' : '/';
            const pipelinePath = `${editorState.projectPath}${sep}fashion-matching-engine${sep}src${sep}fashion_matching${sep}pipeline.py`;
            void editorState.openFile(pipelinePath);
            apiPrompt = `${fashionMatchingSeedPrompt()}\n\n--- SPEC ---\n${userText.slice(0, 12000)}`;
            set({ agentMode: 'agentic', includeMode: 'project' });
          }
        }

        const draftHash = hashChatDraft(apiPrompt, selectedModel, editorState.projectPath);
        const prepReady = prepareState?.ready === true && prepareState.draftHash === draftHash;
        const routeHint = prepReady && prepareState ? prepareState.resolvedModelHint : undefined;
        const prepWarmReady = prepReady && prepareState?.warmContextReady === true;

        const userMsg: ChatMessage = {
          id: generateId(),
          role: 'user',
          content: fashionSeeded
            ? `${userText}\n\n✓ Scaffold creat: fashion-matching-engine/ (${fashionSeedCount} fișiere) — vezi editorul central.`
            : userText,
          timestamp: Date.now(),
        };

        const assistantMsgId = generateId();
        const assistantMsg: ChatMessage = {
          id: assistantMsgId,
          role: 'assistant',
          content: isAgenticPipelineMode(agentMode) ? '⚡ Full Integration pipeline…' : '',
          timestamp: Date.now(),
          model: selectedModel,
          isStreaming: true,
          multiAgentStatus: isAgenticPipelineMode(agentMode) ? 'Memory…' : undefined,
          multiAgentSteps: isAgenticPipelineMode(agentMode)
              ? [{ phase: 'memory', status: 'active', detail: 'init', at: Date.now() }]
              : undefined,
          activitySteps: createInitialActivitySteps(prepReady, prepReady, routeHint),
        };

        const nextMessages = [...messages, userMsg, assistantMsg];
        set({ messages: nextMessages, isStreaming: true, attachedFiles: [] });

        const caval = (window as unknown as CavalWindow).caval;

        const mentionPaths = [
          ...parseMentions(apiPrompt),
          ...attachmentsSnapshot.map((f) => f.name),
        ];
        const uniqueMentions = [...new Set(mentionPaths)];
        const attachProject = shouldAttachProjectContext(apiPrompt, includeMode, {
          hasMentions: uniqueMentions.length > 0,
          hasAttachments: attachmentsSnapshot.length > 0,
          hasProjectPath: Boolean(editorState.projectPath),
        });

        const updateAssistant = (patch: Partial<ChatMessage>) => {
          set((s) => {
            const updated = s.messages.map((m) =>
              m.id === assistantMsgId ? { ...m, ...patch } : m
            );
            const threadTitle =
              s.messages.length <= 2 ? userText.slice(0, 48) : undefined;
            const updatedThreads = s.threads.map((t) =>
              t.id === activeThreadId
                ? {
                    ...t,
                    messages: updated,
                    updatedAt: Date.now(),
                    title: threadTitle ?? t.title,
                  }
                : t
            );
            return { messages: updated, threads: updatedThreads };
          });
        };

        let zlWarmContext = '';
        let workspaceBootstrap = '';
        // Agentic: pipeline on main — skip blocking ZL complete, but still fetch bootstrap.
        const isAgentic = isAgenticPipelineMode(agentMode);

        if (editorState.projectPath && caval) {
          const bootstrapPromise = caval.getWorkspaceBootstrap
            ? withTimeout(
                caval
                  .getWorkspaceBootstrap(editorState.projectPath)
                  .then((b) => (b?.ok && b.bootstrap ? b.bootstrap : '')),
                isAgentic ? 500 : 350,
                ''
              )
            : Promise.resolve('');

          const zlPromise =
            !isAgentic && !prepWarmReady && caval.zlCompleteChat
              ? withTimeout(
                  caval
                    .zlCompleteChat({
                      workspaceRoot: editorState.projectPath,
                      objectiveDraft: apiPrompt,
                      activeFile: editorState.tabs.find((t) => t.id === editorState.activeTabId)?.path,
                      openFiles: editorState.tabs.map((t) => t.path),
                      selectedModel,
                    })
                    .then((r) => (r?.ok && r.prep ? r.prep : null)),
                  500,
                  null
                )
              : Promise.resolve(null);

          const [boot, zlPrep] = await Promise.all([bootstrapPromise, zlPromise]);
          workspaceBootstrap = boot;
          if (zlPrep) {
            zlWarmContext = zlPrep.warmContext ?? '';
            if (zlPrep.partialPlan) {
              updateAssistant({
                content: [
                  'Plan preliminar (Zero-Latency):',
                  ...zlPrep.partialPlan.plan.steps
                    .slice(0, 5)
                    .map((s, i) => `${i + 1}. ${s.title}`),
                ].join('\n'),
              });
            }
          }
        }

        set({ prepareState: null });
        prepareTokenId = null;

        const updateActivity = (
          phase: ChatActivityPhase,
          status: 'active' | 'done',
          detail?: string
        ) => {
          set((s) => {
            const msg = s.messages.find((m) => m.id === assistantMsgId);
            if (!msg?.activitySteps) return {};
            const current = msg.activitySteps.find((step) => step.id === phase);
            if (current?.status === 'done' && status === 'active') return {};
            const activitySteps = patchActivityStep(msg.activitySteps, phase, status, detail);
            const updated = s.messages.map((m) =>
              m.id === assistantMsgId ? { ...m, activitySteps } : m
            );
            const updatedThreads = s.threads.map((t) =>
              t.id === activeThreadId ? { ...t, messages: updated, updatedAt: Date.now() } : t
            );
            return { messages: updated, threads: updatedThreads };
          });
        };

        let gotFirstDelta = false;
        let activeStreamBuffer = '';
        let rawStreamBuffer = '';
        let activeTabPath: string | null = null;
        const toolWrittenPaths: string[] = [];
        let capturedReasoningBrief: ReasoningBrief | undefined;
        let capturedRecapMeta: PipelineRecapMeta | undefined;
        let capturedComposeText = '';
        let pipelineWrittenFiles: string[] = [];

        const isSessionStale = () =>
          isStaleWorkspace(boundWorkspace, useEditorStore.getState().projectPath);

        const syncLiveEditorPreview = (buffer: string) => {
          if (!modeSupportsFileApply(agentMode)) return;
          const live = parseStreamingScaffold(buffer);
          if (!live?.content.trim()) return;
          useEditorStore.getState().updateAiPreview(live.path, live.content);
        };

        const openWrittenFile = (relativePath: string) => {
          const projectPath = useEditorStore.getState().projectPath;
          if (!projectPath) return;
          const sep = projectPath.includes('\\') ? '\\' : '/';
          const abs = `${projectPath}${sep}${relativePath.replace(/\//g, sep)}`;
          void useEditorStore.getState().openFile(abs);
        };

        const finish = (content: string, extra?: Partial<ChatMessage>, tabPath?: string | null) => {
          if (isSessionStale()) {
            updateAssistant({
              content: 'Workspace schimbat — răspuns ignorat.',
              isStreaming: false,
              error: 'workspace-changed',
            });
            set({ isStreaming: false });
            useEditorStore.getState().closeAiPreview();
            return;
          }

          const msgForParse = get().messages.find((m) => m.id === assistantMsgId);
          const reasoningWithFences =
            msgForParse?.reasoning && (msgForParse.reasoning.match(/```/g)?.length ?? 0) >= 2
              ? msgForParse.reasoning
              : '';
          const parseSource = capturedComposeText || rawStreamBuffer || reasoningWithFences || content;
          let finalContent = content;
          if (
            isLlmRefusal(content) &&
            (fashionSeeded || isFashionMatchingEngineRequest(userText))
          ) {
            finalContent = buildFashionMatchingAssistantReply(
              fashionSeedCount || getFashionMatchingScaffoldFiles().length
            );
          }

          const diff = detectDiff(finalContent, tabPath ?? null);
          updateAssistant({
            content: finalContent,
            isStreaming: false,
            diff,
            reasoningExpanded: false,
            ...extra,
          });
          set({ isStreaming: false });

          const projectPath = useEditorStore.getState().projectPath;
          const appliesScaffold = modeSupportsFileApply(agentMode);
          if (!appliesScaffold || !projectPath || diff || extra?.error) return;

          void (async () => {
            if (isSessionStale()) {
              useEditorStore.getState().closeAiPreview();
              return;
            }
            let writtenFiles = fashionSeeded
              ? getFashionMatchingScaffoldFiles().map((f) => f.path)
              : [...new Set([...toolWrittenPaths, ...pipelineWrittenFiles])];
            const parsed = parseScaffoldFiles(parseSource);
            if (parsed.length > 0) {
              writtenFiles = [
                ...writtenFiles,
                ...(await applyScaffoldToWorkspace(projectPath, parsed)),
              ];
            }
            writtenFiles = [...new Set(writtenFiles)];
            await useEditorStore.getState().refreshTree();

            const recapText = msgForParse?.recap ?? capturedRecapMeta?.pendingIssues?.join(' ');
            const incomplete = isDeliveryIncomplete({
              writtenFiles,
              recap: recapText,
              taskCount: capturedRecapMeta?.taskCount ?? 0,
              parseSource,
            });

            if (
              isAgenticPipelineMode(agentMode) &&
              incomplete &&
              canAutoContinueDelivery(deliveryWaveIndex, DEFAULT_FULL_DELIVERY_CONFIG) &&
              !isSessionStale()
            ) {
              deliveryWaveIndex += 1;
              const planContext =
                reasoningWithFences ||
                msgForParse?.reasoning ||
                (capturedReasoningBrief
                  ? [capturedReasoningBrief.goal, capturedReasoningBrief.approach].join('\n')
                  : '');
              updateAssistant({
                error: undefined,
                content: `Continuă delivery (${deliveryWaveIndex}/${DEFAULT_FULL_DELIVERY_CONFIG.maxComposeWaves})…`,
                multiAgentStatus: 'Delivery…',
              });
              void get().sendMessage(
                buildDeliveryContinueMessage(planContext, deliveryWaveIndex - 1)
              );
              return;
            }

            if (writtenFiles.length === 0) {
              useEditorStore.getState().closeAiPreview();
              const hadReasoningPlan = Boolean(
                reasoningWithFences || msgForParse?.reasoning?.trim() || capturedReasoningBrief
              );
              updateAssistant({
                error: hadReasoningPlan
                  ? 'AI a planificat fără fișiere valide (```lang:path```). Trimite SCAFFOLD_CONTINUE sau reformulează promptul.'
                  : 'Niciun fișier scris în workspace. Deschide un folder sau retrimite promptul.',
              });
              return;
            }
            useEditorStore.getState().closeAiPreview();
            openWrittenFile(writtenFiles[writtenFiles.length - 1]!);

            let devToolsForRecap = capturedRecapMeta?.devTools;
            if (!devToolsForRecap?.verify?.ran && window.caval?.workspaceVerify) {
              const verifyRes = await window.caval.workspaceVerify(projectPath);
              if (verifyRes.ok && verifyRes.verify) {
                devToolsForRecap = { ...devToolsForRecap, verify: verifyRes.verify };
              }
            }

            const verifyFailed = devToolsForRecap?.verify?.commands?.find((c) => !c.ok);
            const recapPatch: Partial<ChatMessage> = { writtenFiles };
            if (verifyFailed) {
              recapPatch.error = `Verificare eșuată: ${verifyFailed.command}\n${verifyFailed.output.slice(0, 500)}`;
            } else if (devToolsForRecap?.verify?.ran) {
              recapPatch.content = `✓ Verificare: ${devToolsForRecap.verify.summary}`;
            }

            if (isAgenticPipelineMode(agentMode) && capturedReasoningBrief) {
              const recap = buildFinalRecap({
                brief: capturedReasoningBrief,
                writtenFiles,
                taskCount: capturedRecapMeta?.taskCount ?? 0,
                supervisor: capturedRecapMeta?.supervisor,
                pendingIssues: capturedRecapMeta?.pendingIssues,
                devTools: devToolsForRecap,
                fastPipeline: capturedRecapMeta?.fastPipeline,
              });
              recapPatch.recap = recap;
              recapPatch.content = formatArenaReasoning(capturedReasoningBrief, recap, false);
              if (verifyFailed) {
                recapPatch.error = `Verificare eșuată: ${verifyFailed.command}\n${verifyFailed.output.slice(0, 500)}`;
              }
            }
            updateAssistant(recapPatch);
          })();
        };

        if (
          !fashionSeeded &&
          !isDeliveryContinueRequest(userText) &&
          !isScaffoldContinueRequest(userText) &&
          (agentMode === 'code' || agentMode === 'debug' || isAgenticPipelineMode(agentMode))
        ) {
          const readiness = await checkModelReadiness(selectedModel, get().apiKeys);
          if (!readiness.ready) {
            finish(`${readiness.reason}\n\n${readiness.hint}`, { error: readiness.reason });
            return;
          }
        }

        if (isFashionMatchingEngineRequest(userText) && !editorState.projectPath) {
          finish(
            'Deschide un folder de proiect (**File → Open Folder**) apoi retrimite promptul. Fără folder nu pot crea `fashion-matching-engine/`.',
            { error: 'projectPath lipsă' }
          );
          return;
        }

        if (isAgenticPipelineMode(agentMode) && !editorState.projectPath && !fashionSeeded) {
          finish(
            'Deschide un folder (**File → Open Folder**) — fără proiect deschis nu pot crea fișiere.',
            { error: 'projectPath lipsă' }
          );
          return;
        }

        if (fashionSeeded) {
          useEditorStore.getState().closeAiPreview();
          finish(buildFashionMatchingAssistantReply(fashionSeedCount), {
            activitySteps: markAllActivityDone(createInitialActivitySteps()),
            writtenFiles: getFashionMatchingScaffoldFiles().map((f) => f.path),
          });
          return;
        }

        const handleStreamChunk = (chunk: CavalStreamChunk) => {
          if (chunk.type === 'delivery-pause' && chunk.runId) {
            updateAssistant({
              content:
                'Backend finalizat. Specifică preferințele UI (stil, temă, layout) în panoul de mai jos.',
              isStreaming: false,
              multiAgentStatus: 'UI checkpoint',
            });
            set({
              isStreaming: false,
              deliveryPause: { runId: chunk.runId, streamId: chunk.streamId },
            });
            streamCleanup?.();
            streamCleanup = null;
            return;
          }
          if (isSessionStale()) {
            if (chunk.type === 'done' || chunk.type === 'error') {
              finish('Workspace schimbat — stream oprit.', { error: 'workspace-changed' });
              streamCleanup?.();
              streamCleanup = null;
            }
            return;
          }
          if (chunk.type === 'reasoning' && chunk.reasoningDelta) {
            const prev =
              get().messages.find((m) => m.id === assistantMsgId)?.reasoning ?? '';
            updateAssistant({ reasoning: prev + chunk.reasoningDelta, reasoningExpanded: true });
            updateActivity('think', 'active');
          } else if (chunk.type === 'status' && chunk.phase && chunk.status) {
            updateActivity(chunk.phase, chunk.status, chunk.detail);
          } else if (chunk.type === 'multiagent' && chunk.multiAgentPhase) {
            const phase = chunk.multiAgentPhase as MultiAgentPhase;
            const chunkStatus = chunk.status ?? 'active';
            const label = formatMultiAgentStatus(phase, chunk.detail);
            const prevMsg = get().messages.find((m) => m.id === assistantMsgId);
            const multiAgentSteps = patchMultiAgentSteps(
              prevMsg?.multiAgentSteps,
              phase,
              chunkStatus,
              chunk.detail
            );
            updateAssistant({ multiAgentStatus: label, multiAgentSteps });
            if (isAgenticPipelineMode(agentMode) && !gotFirstDelta) {
              const content = capturedReasoningBrief
                ? formatArenaReasoning(capturedReasoningBrief, undefined, true)
                : stripArenaChatNoise(rawStreamBuffer) || label;
              updateAssistant({ content });
            }
          } else if (chunk.type === 'reasoning-brief') {
            capturedReasoningBrief = {
              goal: chunk.goal ?? chunk.reasoningBrief?.goal ?? '',
              approach: chunk.approach ?? chunk.reasoningBrief?.approach ?? '',
              modules: chunk.modules ?? chunk.reasoningBrief?.modules ?? [],
            };
            updateAssistant({
              reasoningBrief: capturedReasoningBrief,
              content: buildEarlyArenaMessage(capturedReasoningBrief, true),
            });
          }
          if (chunk.type === 'meta' && chunk.resolvedModel) {
            updateAssistant({ resolvedModel: chunk.resolvedModel });
            set({ activeResolvedModel: chunk.resolvedModel });
          }
          if (chunk.type === 'tool' && chunk.toolName === 'write_file' && chunk.toolStatus === 'done') {
            if (isSessionStale()) return;
            const relPath =
              chunk.toolWrittenPath ??
              chunk.toolDetail?.match(/"path"\s*:\s*"([^"]+)"/)?.[1];
            if (relPath) {
              toolWrittenPaths.push(relPath);
              openWrittenFile(relPath);
              void useEditorStore.getState().refreshTree();
            }
          }
          if (chunk.type === 'delta' && chunk.delta) {
            if (!gotFirstDelta) {
              gotFirstDelta = true;
              updateActivity('think', 'done');
              updateActivity('write', 'active');
            }
            rawStreamBuffer += chunk.delta;
            activeStreamBuffer = rawStreamBuffer;
            syncLiveEditorPreview(rawStreamBuffer);
            updateAssistant({
              content: isAgenticPipelineMode(agentMode)
                  ? capturedReasoningBrief
                    ? formatArenaReasoning(capturedReasoningBrief, undefined, true, true)
                    : stripArenaChatNoise(rawStreamBuffer) || '⚡ Scriu cod în editor…'
                  : rawStreamBuffer,
            });
          }
          if (chunk.type === 'error') {
            finish(`Eroare: ${chunk.error ?? 'necunoscută'}`, { error: chunk.error }, activeTabPath);
            streamCleanup?.();
            streamCleanup = null;
          }
          if (chunk.type === 'done') {
            const resolved = chunk.model ?? get().messages.find((m) => m.id === assistantMsgId)?.resolvedModel;
            if (resolved) set({ activeResolvedModel: resolved });
            if (chunk.reasoningBrief) capturedReasoningBrief = chunk.reasoningBrief;
            if (chunk.pipelineRecapMeta) {
              capturedRecapMeta = chunk.pipelineRecapMeta as PipelineRecapMeta;
            }
            if (chunk.composeText?.trim()) {
              capturedComposeText = chunk.composeText;
              if ((rawStreamBuffer.match(/```/g)?.length ?? 0) < 2) {
                rawStreamBuffer = chunk.composeText;
                activeStreamBuffer = chunk.composeText;
                syncLiveEditorPreview(chunk.composeText);
              }
            }
            if (chunk.writtenFiles?.length) {
              pipelineWrittenFiles = chunk.writtenFiles;
            }
            const finalSteps = markAllActivityDone(
              get().messages.find((m) => m.id === assistantMsgId)?.activitySteps ??
                createInitialActivitySteps()
            );
            const streamContent =
              isAgenticPipelineMode(agentMode) && capturedReasoningBrief
                ? formatArenaReasoning(capturedReasoningBrief, undefined, false, true)
                : rawStreamBuffer ||
                  activeStreamBuffer ||
                  get().messages.find((m) => m.id === assistantMsgId)?.content ||
                  '';
            finish(
              streamContent,
              {
                resolvedModel: resolved,
                activitySteps: finalSteps,
                reasoningBrief: capturedReasoningBrief,
              },
              activeTabPath
            );
            streamCleanup?.();
            streamCleanup = null;
          }
        };

        const startIpcStream = (
          contextMessages: AIMessage[],
          streamContext: {
            filePath?: string;
            fileContent?: string;
            projectContext?: string;
          },
          scaffoldMode: boolean
        ) => {
          const uiResume = resumeAfterUiPrefs;
          if (uiResume) {
            resumeAfterUiPrefs = null;
          }

          const streamId = generateId();
          activeStreamId = streamId;
          abortController = new AbortController();
          activeStreamBuffer = '';
          rawStreamBuffer = '';
          gotFirstDelta = false;
          activeTabPath = streamContext.filePath ?? null;

          if (uiResume && caval?.pipelineResumeStream) {
            streamCleanup =
              caval.pipelineResumeStream(
                {
                  runId: uiResume.runId,
                  streamId,
                  uiPreferences: uiResume.uiPreferences,
                  workspaceRoot: boundWorkspace ?? editorState.projectPath ?? '',
                  model: selectedModel,
                  strictReview: isAgenticPipelineMode(agentMode) ? strictReview : undefined,
                },
                handleStreamChunk
              ) ?? null;
            if (!streamCleanup) {
              finish('Pipeline resume indisponibil.', undefined, streamContext.filePath);
            }
            return;
          }

          streamCleanup = caval?.chatStream?.(
            {
              message: apiPrompt,
              model: selectedModel,
              mode: agentMode === 'ask' ? 'ask' : agentMode,
              streamId,
              workspaceRoot: boundWorkspace ?? undefined,
              skipMultiAgent: !isAgenticPipelineMode(agentMode),
              messages: contextMessages.map((m) => ({
                role: m.role,
                content: m.content,
              })),
              context: {
                filePath: streamContext.filePath,
                fileContent: streamContext.fileContent,
                projectContext: streamContext.projectContext,
                mentions: uniqueMentions,
                attachments: attachmentsSnapshot.map((f) => ({
                  path: f.path,
                  name: f.name,
                  content: f.content.slice(0, 16_000),
                })),
              },
              scaffoldMode,
              strictReview: isAgenticPipelineMode(agentMode) ? strictReview : undefined,
            },
            handleStreamChunk
          ) ?? null;

          if (!streamCleanup) {
            finish('IPC streaming indisponibil. Repornește aplicația.', undefined, streamContext.filePath);
          }
        };

        if (editorState.projectPath) {
          void caval?.workspaceSync?.(editorState.projectPath);
          void caval?.mcpEnsureReady?.();
        }

        const isFastChat =
          agentMode !== 'code' &&
          !isAgenticPipelineMode(agentMode) &&
          !editorState.projectPath &&
          !attachProject &&
          !isByokModel(selectedModel) &&
          uniqueMentions.length === 0 &&
          attachmentsSnapshot.length === 0;

        const scaffoldMode =
          modeSupportsFileApply(agentMode) &&
          (fashionSeeded ||
            attachmentsSnapshot.some((f) => f.path.startsWith('engineering://')) ||
            /\bSCAFFOLD\b/i.test(apiPrompt) ||
            isScaffoldContinueRequest(apiPrompt) ||
            (isAgenticPipelineMode(agentMode) && isDeliveryContinueRequest(apiPrompt)));

        if (isAgenticPipelineMode(agentMode) && editorState.projectPath) {
          useEditorStore.getState().showAiPreview('generating.ts', '// AI scrie cod…\n');
        }

        if (isFastChat) {
          const contextMessages = buildFastChatMessages(
            apiPrompt,
            messages.map((m) => ({ role: m.role, content: m.content })),
            agentMode
          );
          startIpcStream(
            contextMessages,
            {
              projectContext: mergeProjectContextWithBootstrap(
                prepWarmReady && zlWarmContext ? zlWarmContext : undefined,
                workspaceBootstrap
              ) || undefined,
            },
            scaffoldMode
          );
          return;
        }

        let activeTab = editorState.tabs.find((t) => t.id === editorState.activeTabId) ?? null;

        if (activeTab?.path && activeTab.isDirty && caval?.fs?.readFile) {
          try {
            const fresh = await caval.fs.readFile(activeTab.path);
            if (fresh.ok && fresh.content != null) {
              activeTab = { ...activeTab, content: fresh.content };
            }
          } catch { /* ignore */ }
        }

        let projectContext = '';
        if (prepWarmReady && zlWarmContext.trim()) {
          projectContext = zlWarmContext;
        } else if (attachProject) {
          if (!prepReady) {
            updateActivity('prepare', 'active');
          }
          if (!prepWarmReady && caval?.contextSearch && !isAgenticPipelineMode(agentMode)) {
            try {
              const searchQuery =
                apiPrompt.trim().length > 3
                  ? apiPrompt
                  : [activeTab?.path, editorState.projectPath].filter(Boolean).join(' ');
              const search = await withTimeout(
                caval.contextSearch({ query: searchQuery, limit: 6 }),
                500,
                { ok: false as const }
              );
              if (search.ok && search.results?.length) {
                projectContext = formatContextSearchResults(search.results);
              }
            } catch { /* ignore */ }
          }
          updateActivity('prepare', 'done');
        }

        projectContext = mergeProjectContextWithBootstrap(projectContext, workspaceBootstrap);

        const mentionFiles =
          uniqueMentions.length > 0 && caval?.fs?.readFile
            ? await resolveMentionFiles(
                uniqueMentions,
                editorState.projectPath,
                (p) => caval.fs!.readFile!(p)
              )
            : [];

        const editorSelection = useEditorStore.getState().editorSelection;
        const selectionText = editorSelection?.text?.trim() || undefined;

        const contextMessages: AIMessage[] = buildContextMessages(
          apiPrompt,
          messages.map((m) => ({ role: m.role, content: m.content })),
          {
            activeTab,
            selection: selectionText,
            fileTree: attachProject && !isAgenticPipelineMode(agentMode) ? editorState.fileTree : [],
            projectPath: editorState.projectPath,
            includeMode: selectionText && includeMode === 'selection' ? 'selection' : attachProject ? includeMode : 'file',
            skipActiveFile: !attachProject,
            projectContext,
            mentions: uniqueMentions,
            mentionFiles,
            attachments: attachmentsSnapshot,
            agentMode,
          }
        );

        if (isByokModel(selectedModel)) {
          let provider;
          try {
            assertRendererChatAllowed({
              prompt: apiPrompt,
              workspaceRoot: editorState.projectPath,
              capability: agentMode === 'plan' ? 'planning' : 'chat',
              intent: agentMode === 'debug' ? 'debug' : 'kilocode',
            });
            provider = createProvider(selectedModel as never, apiKeys);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            finish(`Eroare: ${msg}`, { error: msg }, activeTab?.path);
            return;
          }

          updateActivity('route', 'active');
          updateActivity('route', 'done', selectedModel);
          updateActivity('connect', 'active');
          updateActivity('connect', 'done');
          updateActivity('think', 'active');

          abortController = new AbortController();
          let fullContent = '';
          let byokFirstDelta = false;
          try {
            await provider.streamChat(
              contextMessages,
              ({ delta, done, error }) => {
                if (error) {
                  finish(`Eroare API: ${error}`, { error }, activeTab?.path);
                  return;
                }
                if (!byokFirstDelta && delta) {
                  byokFirstDelta = true;
                  updateActivity('think', 'done');
                  updateActivity('write', 'active');
                }
                fullContent += delta;
                syncLiveEditorPreview(fullContent);
                if (done) {
                  const finalSteps = markAllActivityDone(
                    get().messages.find((m) => m.id === assistantMsgId)?.activitySteps ??
                      createInitialActivitySteps()
                  );
                  finish(fullContent, { resolvedModel: selectedModel, activitySteps: finalSteps }, activeTab?.path);
                  set({ activeResolvedModel: selectedModel });
                }
                else updateAssistant({ content: fullContent });
              },
              abortController.signal
            );
          } catch (err: unknown) {
            if (err instanceof Error && err.name !== 'AbortError') {
              finish(`Eroare de rețea: ${err.message}`, { error: err.message }, activeTab?.path);
            }
          }
          return;
        }

        startIpcStream(contextMessages, {
          filePath: attachProject ? activeTab?.path : undefined,
          fileContent: attachProject ? activeTab?.content : undefined,
          projectContext,
        }, scaffoldMode);
      },

      stopStreaming: () => {
        const sid = activeStreamId;
        abortController?.abort();
        if (sid) {
          void getCaval()?.abortChatStream?.(sid);
        }
        streamCleanup?.();
        streamCleanup = null;
        activeStreamId = null;
        useEditorStore.getState().closeAiPreview();
        set((s) => ({
          isStreaming: false,
          messages: s.messages.map((m) =>
            m.isStreaming ? { ...m, isStreaming: false } : m
          ),
        }));
      },

      clearChat: () => {
        set((s) => {
          const updatedThreads = s.threads.map((t) =>
            t.id === s.activeThreadId ? { ...t, messages: [], title: 'Chat nou' } : t
          );
          return { messages: [], threads: updatedThreads };
        });
      },

      applyDiff: async (messageId) => {
        const msg = get().messages.find((m) => m.id === messageId);
        if (!msg?.diff || msg.diff.applied || msg.diff.rejected) return;
        const { tabs, updateTabContent, openFile } = useEditorStore.getState();
        let tab = tabs.find((t) => t.path === msg.diff!.filePath);
        if (!tab) {
          await openFile(msg.diff.filePath);
          tab = useEditorStore.getState().tabs.find((t) => t.path === msg.diff!.filePath);
        }
        if (!tab) return;

        const previousContent = tab.content;
        const newContent = applyUnifiedDiff(tab.content, msg.diff.patch);
        updateTabContent(tab.id, newContent);

        const writeResult = await window.caval?.fs?.writeFile?.(tab.path, newContent);
        if (writeResult && !writeResult.ok) {
          console.error('[ai-store] applyDiff write failed:', writeResult.error);
          return;
        }
        if (writeResult?.ok) {
          useEditorStore.setState((s) => ({
            tabs: s.tabs.map((t) => (t.id === tab!.id ? { ...t, isDirty: false } : t)),
          }));
        }

        patchMessageInThreads(set, messageId, (m) =>
          m.diff
            ? { ...m, diff: { ...m.diff, applied: true, previousContent } }
            : m
        );
      },

      rejectDiff: (messageId) => {
        patchMessageInThreads(set, messageId, (m) =>
          m.diff ? { ...m, diff: undefined } : m
        );
      },

      rollbackDiff: async (messageId) => {
        const msg = get().messages.find((m) => m.id === messageId);
        if (!msg?.diff?.applied || msg.diff.previousContent == null) return;
        const { tabs, updateTabContent, openFile } = useEditorStore.getState();
        let tab = tabs.find((t) => t.path === msg.diff!.filePath);
        if (!tab) {
          await openFile(msg.diff.filePath);
          tab = useEditorStore.getState().tabs.find((t) => t.path === msg.diff!.filePath);
        }
        if (!tab) return;

        const restored = msg.diff.previousContent;
        updateTabContent(tab.id, restored);
        const writeResult = await window.caval?.fs?.writeFile?.(tab.path, restored);
        if (writeResult && !writeResult.ok) {
          console.error('[ai-store] rollbackDiff write failed:', writeResult.error);
          return;
        }
        if (writeResult?.ok) {
          useEditorStore.setState((s) => ({
            tabs: s.tabs.map((t) => (t.id === tab!.id ? { ...t, isDirty: false } : t)),
          }));
        }

        patchMessageInThreads(set, messageId, (m) =>
          m.diff
            ? { ...m, diff: { ...m.diff, applied: false, previousContent: undefined } }
            : m
        );
      },

      runWorkspaceVerifyAndReport: async () => {
        if (get().verifyInFlight !== 'none') return;
        const projectPath = useEditorStore.getState().projectPath;
        if (!projectPath) {
          appendChatReportMessage(set, '**Verificare workspace**\n\nDeschide un folder de proiect înainte de a rula testele.', {
            error: 'projectPath lipsă',
          });
          return;
        }
        const caval = getCaval();
        if (!caval?.workspaceVerify) {
          appendChatReportMessage(set, '**Verificare workspace**\n\nIPC workspaceVerify indisponibil.', {
            error: 'workspaceVerify lipsă',
          });
          return;
        }

        set({ verifyInFlight: 'tests' });
        try {
          const res = await caval.workspaceVerify(projectPath);
          if (!res.ok || !res.verify) {
            appendChatReportMessage(
              set,
              `**Verificare workspace**\n\n${res.error ?? 'Verificare eșuată.'}`,
              { error: res.error ?? 'verify failed' }
            );
            set({ pendingChatDraft: 'fixează erorile de mai sus' });
            return;
          }
          const allOk = !res.verify.commands.length || res.verify.commands.every((c) => c.ok);
          appendChatReportMessage(set, formatVerifyThreadMessage(res.verify, allOk), {
            error: allOk ? undefined : 'verify failed',
          });
          if (!allOk) {
            set({ pendingChatDraft: 'fixează erorile de mai sus' });
          }
        } finally {
          set({ verifyInFlight: 'none' });
        }
      },

      runBuildAndReport: async () => {
        if (get().verifyInFlight !== 'none') return;
        const projectPath = useEditorStore.getState().projectPath;
        if (!projectPath) {
          appendChatReportMessage(set, '**Build**\n\nDeschide un folder de proiect înainte de a rula build-ul.', {
            error: 'projectPath lipsă',
          });
          return;
        }
        const caval = getCaval();
        if (!caval?.toolExecute) {
          appendChatReportMessage(set, '**Build**\n\nIPC toolExecute indisponibil.', {
            error: 'toolExecute lipsă',
          });
          return;
        }

        set({ verifyInFlight: 'build' });
        try {
          const res = await caval.toolExecute({
            name: 'run_command',
            arguments: { command: 'npm run build' },
          });
          const payload = res.output as
            | { command?: string; exitCode?: number | null; output?: string }
            | undefined;
          const command = payload?.command ?? 'npm run build';
          const exitCode = payload?.exitCode ?? null;
          const output = truncateVerifyOutput((payload?.output ?? res.error ?? '').trim() || '(fără output)');
          const ok = res.ok && (payload?.exitCode == null || payload.exitCode === 0);
          let body = `**Build**\n\n### ${command} — ${ok ? '✓ ok' : '✗ fail'} (exit ${exitCode ?? 'n/a'})\n\`\`\`\n${output}\n\`\`\``;
          if (!ok) {
            body += '\n\n_Poți cere: fixează erorile de mai sus_';
          }
          appendChatReportMessage(set, body, { error: ok ? undefined : 'build failed' });
          if (!ok) {
            set({ pendingChatDraft: 'fixează erorile de mai sus' });
          }
        } finally {
          set({ verifyInFlight: 'none' });
        }
      },

      clearPendingChatDraft: () => set({ pendingChatDraft: null }),

      submitUiDeliveryPreferences: async (prefs) => {
        const pause = get().deliveryPause;
        if (!pause || !prefs.trim()) return;
        resumeAfterUiPrefs = { runId: pause.runId, uiPreferences: prefs.trim() };
        set({ deliveryPause: null });
        await get().sendMessage(`[UI Preferences]\n${prefs.trim()}`);
      },

      handoffFromEngineering: ({ project, userPrompt }) => {
        const projectPath = useEditorStore.getState().projectPath;
        if (!projectPath) {
          return {
            ok: false as const,
            error: 'Deschide un folder de proiect (File → Open Folder) înainte de a genera software.',
          };
        }

        const title = project.spec.title.trim().slice(0, 48) || 'Software din Engineering';
        const contextMarkdown = formatEngineeringContextForCoding(project, userPrompt);
        const suggestedPrompt = buildSoftwareHandoffPrompt(project);
        const thread = createThread(title, projectPath);

        get().clearPrepareState();

        set({
          agentMode: 'agentic',
          selectedModel: getAgentMode('agentic').defaultModel,
          includeMode: 'project',
          activeThreadId: thread.id,
          threads: [thread, ...get().threads],
          messages: [],
          attachedFiles: [
            {
              id: generateId(),
              path: 'engineering://context',
              name: `Engineering — ${project.spec.title.slice(0, 40)}`,
              content: contextMarkdown,
            },
          ],
          pendingChatDraft: suggestedPrompt,
          pendingAutoSend: true,
          prepareState: null,
        });

        dispatchOpenCodingChat();
        return { ok: true as const };
      },
    }),
    {
      name: 'caval-ai-store-v2',
      partialize: (s) => ({
        selectedModel: s.selectedModel,
        agentMode: s.agentMode,
        includeMode: s.includeMode,
        strictReview: s.strictReview,
        threads: s.threads,
        activeThreadId: s.activeThreadId,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (state.includeMode === 'file') {
          state.includeMode = 'project';
        }
        if (state.selectedModel === 'caval-auto/free') {
          void getCaval()?.secretsGet?.().then((res) => {
            if (hasOpenRouterKey(undefined, res?.secrets)) {
              useAIStore.setState({ selectedModel: 'caval-auto/balanced' });
            }
          });
        }
        const thread = state.threads.find((t) => t.id === state.activeThreadId);
        if (thread) state.messages = thread.messages;
        // Migrate legacy Code threads that used the multi-agent pipeline
        if (state.agentMode === 'code') {
          const hasPipelineArtifacts = state.threads.some((t) =>
            t.messages.some(
              (m) =>
                (m.multiAgentSteps?.length ?? 0) > 0 ||
                Boolean(m.reasoningBrief) ||
                Boolean(m.recap)
            )
          );
          if (hasPipelineArtifacts) {
            state.agentMode = 'agentic';
          }
        }
        const legacyMode = state.agentMode as string;
        if (legacyMode === 'architect') {
          state.agentMode = 'plan';
        }
        if (!AGENT_MODES.some((m) => m.id === state.agentMode)) {
          state.agentMode = 'code';
        }
        void loadApiKeysFromSecrets().then((secrets) => {
          if (Object.keys(secrets).length > 0) {
            useAIStore.setState({ apiKeys: secrets });
          }
        });
      },
    }
  )
);

registerWorkspaceChangeHandler((path) => {
  useAIStore.getState().onWorkspaceChanged(path);
});

if (typeof window !== 'undefined') {
  queueMicrotask(() => {
    getCaval()?.onWorkspaceSessionReset?.(() => {
      useAIStore.getState().onWorkspaceChanged(useEditorStore.getState().projectPath);
    });
  });
}

export function getModelDisplayLabel(id: string, labels: Record<string, string>): string {
  if (labels[id]) return labels[id];
  if (labels[`openrouter:${id}`]) return labels[`openrouter:${id}`];
  const short = id.split('/').pop() ?? id;
  if (labels[short]) return labels[short];
  return id
    .replace('caval-auto/', 'Auto ')
    .replace('openrouter:', '')
    .replace(/^([^:]+):/, '$1 ');
}

/** Etichetă pentru UI: selecție + model efectiv dacă diferă */
export function formatWorkingModel(
  selectedModel: ModelSelectionId,
  activeResolvedModel: string | null,
  labels: Record<string, string>
): { primary: string; secondary: string | null } {
  const selectionLabel = getModelDisplayLabel(selectedModel, labels);
  const isAuto = selectedModel.startsWith('caval-auto/');
  if (!activeResolvedModel) {
    return { primary: selectionLabel, secondary: isAuto ? 'se rezolvă...' : null };
  }
  const resolvedLabel = getModelDisplayLabel(activeResolvedModel, labels);
  if (!isAuto && activeResolvedModel === selectedModel) {
    return { primary: resolvedLabel, secondary: null };
  }
  if (resolvedLabel === selectionLabel) {
    return { primary: resolvedLabel, secondary: null };
  }
  return { primary: resolvedLabel, secondary: isAuto ? selectionLabel : null };
}
