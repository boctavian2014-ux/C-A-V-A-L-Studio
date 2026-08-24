import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AIMessage, ApiKeys } from '../multi-model/provider';
import type { ModelSelectionId } from '../models/model-catalog';
import { isByokModel, checkModelReadiness } from '../models/model-readiness';
import { apiKeysToSecrets, BYOK_TO_SECRET, CONFIGURED_MARKER, isPersistableSecret } from '../models/api-secrets';
import { modeSupportsFileApply } from '../models/model-coding-guide';
import { getAgentMode, isAgenticPipelineMode, AGENT_MODES, type AgentModeId, DEFAULT_CAVAL_CONFIG } from '../modes/agent-modes';
import { loadCavalConfigFromClient, resolveModelForMode } from '../config/caval-config-shared';
import { resolveEffectiveMode, isCavalloModesTestRequest } from '../modes/mode-router';
import { CAVALLO_MODES_TEST_FIXTURE } from '../prompts/cavallo-mode-protocol';
import { normalizeAgentModeId } from '../modes/intent-detector';
import {
  buildContextMessages,
  buildFastChatMessages,
  parseMentions,
  formatContextSearchResults,
  resolveMentionFiles,
  shouldAttachProjectContext,
  looksLikeFileCreationPrompt,
} from '../context-engine/context-builder';
import { mergeProjectContextWithBootstrap } from '../context/workspace-bootstrap-shared';
import { isScaffoldContinueRequest, buildScaffoldContinueUserMessage } from '../prompts/scaffold-emission-rule';
import { isArenaContinueRequest } from '../prompts/arena-continue';
import { isAgenticRepairRequest, buildAgenticRepairMessage } from '../prompts/agentic-repair';
import {
  buildDeliveryContinueMessage,
  isDeliveryContinueRequest,
} from '../prompts/full-delivery-rule';
import {
  canAutoContinueDelivery,
  canAutoContinueRepair,
  isDeliveryBlocked,
} from './delivery-orchestrator';
import { DEFAULT_FULL_DELIVERY_CONFIG, type FullDeliveryConfig } from './multi-agent/types';
import {
  DEFAULT_SESSION_FOCUS,
  isStaleWorkspace,
  workspaceFolderTitle,
} from './workspace-session';
import { registerWorkspaceChangeHandler } from '../../src/renderer/store/workspace-bridge';
import { assertRendererChatAllowed } from '../safety/renderer-chat-guard';
import { useEditorStore } from '../../src/renderer/store/editor-store';
import { useAiWorkCanvasStore } from '../../src/renderer/store/ai-work-canvas-store';
import {
  bootstrapRoboticsDesktopProject,
} from '../../src/renderer/components/engineering/bootstrap-robotics-project';
import {
  ensureDesktopProject,
  projectNameFromPrompt,
} from '../../src/renderer/hooks/useOpenWorkspace';
import { useOutputStore } from '../../src/renderer/store/output-store';
import { parseProblemsFromOutput } from '../../src/renderer/store/parse-problems';
import { useProblemsStore } from '../../src/renderer/store/problems-store';
import { dispatchTerminalPanelTab } from '../../src/renderer/terminal/terminal-events';
import { CAVAL_OPEN_CODING_CHAT_EVENT } from '../engineering/engineering-handoff';
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
import {
  applyFallbackScaffold,
  buildFallbackScaffoldTimelineEvent,
  FALLBACK_SCAFFOLD_TOAST,
  FALLBACK_RUNNABLE_TOAST,
  workspaceHasRunnableWebProject,
} from './fallback-scaffold';
import { useLiveAiEditsStore } from './live-ai-edits-store';
import { parseStreamingScaffold, peekStreamingScaffoldPath } from './scaffold-parser';
import {
  buildUniversalWebContext,
  mergeProjectContextWithWebContext,
} from '../tools/auto-web-context';
import {
  buildFashionMatchingAssistantReply,
  detectFashionArchetype,
  fashionMatchingSeedPrompt,
  isFashionMatchingEngineRequest,
  seedFashionForRequest,
} from './fashion-matching-seed';
import { getFashionMatchingScaffoldFiles } from '../scaffolds/fashion-matching/manifest';
import { isLlmRefusal } from '../scaffolds/fashion-matching/detect';
import { stripArenaChatNoise, formatArenaReasoning } from './chat-display';
import { isTranscriptVisibleKind } from '../../src/shared/chat-stream-visibility';
import {
  buildEarlyArenaMessage,
  buildFinalRecap,
  briefFromContext,
  type ReasoningBrief,
} from './reasoning-brief';
import {
  buildProjectCompletionRecap,
  buildProjectCompletionToast,
  findPipelineVerifyTargetMessage,
} from './project-completion-announce';
import { DEFAULT_REASONING_LAYER_CONFIG } from './multi-agent/types';
import type { PipelineRecapMeta } from './multi-agent/types';
import { showWorkbenchToast } from '../../src/renderer/commands/workbench-toast';
import { tActive } from '../i18n/active-locale';
import type { IdeContextMode, IdeContextPayload } from '../../src/shared/ai-context-contract';
import type { TimelineEvent } from '../../src/shared/ai-timeline-contract';
import { sanitizeTimelineEvent } from '../../src/shared/ai-timeline-contract';
import { collectRendererIdeContext } from './ide-context-collect';
import { readLiveEditorSelection } from '../../src/renderer/ai/explain-selection';

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
  /** Pas 7a.4 — restored written_files rows (id for historical Revert). */
  historicalWrittenFiles?: Array<{
    id: string;
    filePath: string;
    messageId?: string;
    createdAt?: number;
  }>;
  /** Pas 6.4 — proposed chat applies awaiting Accept. */
  proposedWrites?: import('../../src/shared/ai-chat-apply-contract').ProposedWrite[];
  proposeStageKey?: string;
  /** Pas 5.4 — unified activity timeline for this assistant message. */
  timelineEvents?: TimelineEvent[];
  timelineExpanded?: boolean;
  multiAgentStatus?: string;
  multiAgentSteps?: MultiAgentStepRecord[];
  reasoningBrief?: ReasoningBrief;
  recap?: string;
  workspacePath?: string;
  pipelineRunId?: string;
  streamId?: string;
  pipelineRecapMeta?: PipelineRecapMeta;
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
  autoApplied?: boolean;
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
  /** Hidden from Arena chat bar; messages retained in localStorage. */
  archived?: boolean;
  /** Pas 5.2 — per-thread IDE context toggle; default enabled. */
  ideContextMode?: IdeContextMode;
}

/** Mark one thread archived; optionally persist current messages into it. */
export function archiveThreadInList(
  threads: ChatThread[],
  threadId: string,
  messages?: ChatMessage[]
): ChatThread[] {
  return threads.map((t) =>
    t.id === threadId
      ? { ...t, archived: true, messages: messages ?? t.messages, updatedAt: Date.now() }
      : t
  );
}

/** Archive non-archived threads that do not belong to the given workspace. */
export function archiveThreadsForWorkspaceSwitch(
  threads: ChatThread[],
  workspacePath: string | null,
  activeThreadId: string,
  activeMessages: ChatMessage[]
): ChatThread[] {
  return threads.map((t) => {
    const withMessages = t.id === activeThreadId ? { ...t, messages: activeMessages } : t;
    if (withMessages.archived) return withMessages;
    if (withMessages.workspacePath !== workspacePath) {
      return { ...withMessages, archived: true, updatedAt: Date.now() };
    }
    return withMessages;
  });
}

/** Non-archived thread for workspace (at most one visible). */
export function visibleThreadForWorkspace(
  threads: ChatThread[],
  workspacePath: string | null
): ChatThread | undefined {
  return threads.find((t) => !t.archived && t.workspacePath === workspacePath);
}

/** On app rehydrate: only the active thread stays visible; rest archived. */
export function migrateThreadsOnRehydrate(
  threads: ChatThread[],
  activeThreadId: string
): ChatThread[] {
  return threads.map((t) => ({
    ...t,
    archived: t.id !== activeThreadId,
  }));
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
        /** Pas 5.2 — omit when per-thread toggle is OFF. */
        ideContext?: IdeContextPayload;
        scaffoldMode?: boolean;
        skipMultiAgent?: boolean;
        strictReview?: boolean;
        conversationId?: string;
        assistantMessageId?: string;
      },
      onChunk: (chunk: CavalStreamChunk) => void
    ) => () => void;
    abortChatStream?: (streamId: string) => Promise<{ ok: boolean }>;
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
    workspaceSync?: (folderPath: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
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
    secretsGet?: () => Promise<{
      ok: boolean;
      providers?: Array<{
        provider: string;
        configured: boolean;
        source: 'environment' | 'secure-storage' | 'none';
        lastValidatedAt: string | null;
      }>;
      configured?: Record<string, boolean>;
    }>;
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
      writeFile?: (filePath: string, content: string) => Promise<{ ok: boolean; error?: string }>;
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

const STOPPED_ASSISTANT_COPY =
  '■ Oprit. Conversația de mai sus rămâne ca context — poți continua sau reformula cererea.';

export function isChatStopIntent(text: string): boolean {
  const normalized = text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return /^(stop|opreste|nu mai|oprit|anuleaza|cancel|abort|stai|gata|■\s*stop)$/.test(normalized);
}

function finalizeStoppedAssistantMessage(message: ChatMessage): ChatMessage {
  return {
    ...message,
    isStreaming: false,
    content: STOPPED_ASSISTANT_COPY,
    multiAgentStatus: 'Oprit',
    multiAgentSteps: message.multiAgentSteps?.map((step) => ({
      ...step,
      status: 'done' as const,
      detail: step.status === 'active' ? 'oprit' : step.detail,
    })),
    activitySteps: message.activitySteps
      ? markAllActivityDone(message.activitySteps)
      : message.activitySteps,
  };
}

function assertSendNotAborted(signal: AbortSignal): void {
  if (signal.aborted || userStoppedStream) {
    throw new DOMException('User stopped send', 'AbortError');
  }
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
  /** Active thread's IDE context mode (default enabled). */
  ideContextMode: IdeContextMode;
  setIdeContextMode: (mode: IdeContextMode) => void;
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
  queueChatFromPanel: (text: string, options?: { autoSend?: boolean }) => void;
  handoffFromEngineering: (input: {
    project: EngProject;
    userPrompt: string;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;

  runWorkspaceVerifyAndReport: () => Promise<void>;
  runBuildAndReport: () => Promise<void>;
  verifyInFlight: 'none' | 'tests' | 'build';
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createThread(title = tActive('ai.panel.newChat'), workspacePath: string | null = null): ChatThread {
  const id = generateId();
  return {
    id,
    title,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    workspacePath,
    ideContextMode: 'enabled',
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

async function applyDiffToWorkspace(diff: DetectedDiff): Promise<{ ok: boolean; filePath?: string }> {
  const { tabs, updateTabContent, openFile } = useEditorStore.getState();
  let tab = tabs.find((t) => t.path === diff.filePath);
  if (!tab) {
    await openFile(diff.filePath);
    tab = useEditorStore.getState().tabs.find((t) => t.path === diff.filePath);
  }
  if (!tab) return { ok: false };

  const previousContent = tab.content;
  const newContent = applyUnifiedDiff(tab.content, diff.patch);
  updateTabContent(tab.id, newContent);

  const writeResult = await window.caval?.fs?.writeFile?.(tab.path, newContent);
  if (writeResult && !writeResult.ok) {
    updateTabContent(tab.id, previousContent);
    console.error('[ai-store] applyDiffToWorkspace write failed:', writeResult.error);
    return { ok: false };
  }
  if (writeResult?.ok) {
    useEditorStore.setState((s) => ({
      tabs: s.tabs.map((t) => (t.id === tab!.id ? { ...t, isDirty: false } : t)),
    }));
  }

  return { ok: true, filePath: diff.filePath };
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

const persistApiKeys = async (apiKeys: ApiKeys, extraPatch?: Record<string, string>): Promise<void> => {
  // Only persist real secret values — never write `__configured__` markers to disk.
  const fromKeys = apiKeysToSecrets(apiKeys);
  const patch: Record<string, string> = { ...fromKeys };
  if (extraPatch) {
    for (const [key, value] of Object.entries(extraPatch)) {
      if (isPersistableSecret(value)) patch[key] = value.trim();
      else if (value?.trim() === '') patch[key] = ''; // explicit clear only via empty string in extraPatch
    }
  }
  if (Object.keys(patch).length === 0) return;
  await getCaval()?.secretsSet?.(patch);
};

/** Persist a single BYOK provider key without touching other stored secrets. */
const persistSingleByokKey = async (
  provider: keyof typeof BYOK_TO_SECRET,
  key: string
): Promise<void> => {
  const secretKey = BYOK_TO_SECRET[provider];
  if (!secretKey) return;
  const trimmed = key.trim();
  if (!trimmed || !isPersistableSecret(trimmed)) return;
  await getCaval()?.secretsSet?.({ [secretKey]: trimmed });
};

const loadApiKeysFromSecrets = async (): Promise<ApiKeys> => {
  const result = await getCaval()?.secretsGet?.();
  const configured = result?.configured ?? {};
  // Never hydrate plaintext — only presence markers for readiness / UI badges.
  return {
    anthropic: configured.ANTHROPIC_API_KEY ? '__configured__' : undefined,
    openai: configured.OPENAI_API_KEY ? '__configured__' : undefined,
    google: configured.GOOGLE_API_KEY ? '__configured__' : undefined,
  };
};

/** Load persisted API keys from disk into the AI store (call on app mount). */
export async function hydrateApiKeysFromSecrets(): Promise<void> {
  const apiKeys = await loadApiKeysFromSecrets();
  useAIStore.setState({ apiKeys });
}

let pipelineVerifyUnsub: (() => void) | null = null;

/** Subscribe once to background pipeline verify results (agentic speed profile). */
export function ensurePipelineVerifyListener(): void {
  if (pipelineVerifyUnsub) return;
  const unsub = getCaval()?.onPipelineVerifyStatus?.((payload) => {
    const state = useAIStore.getState();
    const currentPath = useEditorStore.getState().projectPath;
    const target = findPipelineVerifyTargetMessage(
      state.messages,
      payload,
      currentPath
    );
    if (!target) return;
    const suffix = payload.ok
      ? `\n\n✓ Verify: ${payload.summary}`
      : `\n\n⚠️ [NEEDS_REVIEW] Verify: ${payload.summary}${
          payload.issues.length
            ? `\n${payload.issues.slice(0, 4).map((i) => `- ${i.message}`).join('\n')}`
            : ''
        }`;
    useAIStore.setState({
      messages: state.messages.map((m) =>
        m.id === target.id
          ? {
              ...m,
              content: `${m.content ?? ''}${suffix}`.trim(),
              multiAgentStatus: payload.ok ? 'Verify OK' : 'Verify failed',
            }
          : m
      ),
    });
  });
  if (unsub) pipelineVerifyUnsub = unsub;
}

let abortController: AbortController | null = null;
let streamCleanup: (() => void) | null = null;
let activeStreamId: string | null = null;
let pendingStreamId: string | null = null;
let sendAbortController: AbortController | null = null;
let userStoppedStream = false;
let prepareTokenId: string | null = null;
let prepareRequestId = 0;
let deliveryWaveIndex = 0;
let agenticRepairWave = 0;

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
      ideContextMode: 'enabled',
      strictReview: true,
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
      verifyInFlight: 'none' as const,

      setModel: (id) => {
        set({ selectedModel: id, activeResolvedModel: null });
        void get().refreshResolvedModel();
      },
      setAgentMode: (mode) => {
        const normalized = normalizeAgentModeId(mode);
        void (async () => {
          const projectPath = useEditorStore.getState().projectPath;
          const config = await loadCavalConfigFromClient(projectPath);
          const modelId = resolveModelForMode(normalized, config);
          set({
            agentMode: normalized,
            selectedModel: modelId,
            activeResolvedModel: null,
            modeSwitchNotice: null,
          });
          void get().refreshResolvedModel();
        })();
      },
      clearModeSwitchNotice: () => set({ modeSwitchNotice: null }),
      setIncludeMode: (mode) => set({ includeMode: mode }),
      setIdeContextMode: (mode) => {
        set((s) => ({
          ideContextMode: mode,
          threads: s.threads.map((t) =>
            t.id === s.activeThreadId ? { ...t, ideContextMode: mode, updatedAt: Date.now() } : t
          ),
        }));
      },
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
          const trimmed = key.trim();
          const apiKeys = {
            ...s.apiKeys,
            [provider]: trimmed ? trimmed : undefined,
          };
          const byokKey = provider as keyof typeof BYOK_TO_SECRET;
          if (BYOK_TO_SECRET[byokKey]) {
            if (trimmed && isPersistableSecret(trimmed)) {
              void persistSingleByokKey(byokKey, trimmed);
              // Never keep plaintext in the renderer store — only presence marker.
              apiKeys[provider] = CONFIGURED_MARKER;
            }
            // Empty key: do not wipe disk — user must clear explicitly elsewhere
          } else {
            void persistApiKeys(apiKeys);
            // Non-BYOK provider keys are persisted via secretsSet; store markers only.
            if (trimmed && isPersistableSecret(trimmed)) {
              apiKeys[provider] = CONFIGURED_MARKER;
            }
          }
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
        const { activeThreadId, messages } = get();
        set((s) => {
          let threads = archiveThreadInList(s.threads, activeThreadId, messages);
          threads = threads.map((t) =>
            !t.archived && t.workspacePath === workspacePath && t.id !== activeThreadId
              ? { ...t, archived: true, updatedAt: Date.now() }
              : t
          );
          const thread = createThread(
            title ?? workspaceFolderTitle(workspacePath),
            workspacePath
          );
          return {
            threads: [thread, ...threads],
            activeThreadId: thread.id,
            messages: [],
            ideContextMode: thread.ideContextMode ?? 'enabled',
          };
        });
      },

      onWorkspaceChanged: (nextPath) => {
        if (!DEFAULT_SESSION_FOCUS.singleProjectFocus) return;

        const active = get().threads.find((t) => t.id === get().activeThreadId);
        const alreadyOnWorkspace =
          active?.workspacePath === nextPath &&
          !active?.archived &&
          !get().isStreaming &&
          !get().prepareInFlight;
        if (alreadyOnWorkspace) return;

        void getCaval()?.workspaceSessionReset?.();
        get().stopStreaming();
        get().clearPrepareState();
        set({ pendingChatDraft: null, pendingAutoSend: false, attachedFiles: [] });
        useEditorStore.getState().closeAiPreview();

        set((s) => {
          let threads = archiveThreadsForWorkspaceSwitch(
            s.threads,
            nextPath,
            s.activeThreadId,
            s.messages
          );

          if (DEFAULT_SESSION_FOCUS.newThreadOnWorkspaceChange) {
            threads = threads.map((t) =>
              !t.archived && t.workspacePath === nextPath
                ? { ...t, archived: true, updatedAt: Date.now() }
                : t
            );
            const thread = createThread(workspaceFolderTitle(nextPath), nextPath);
            return {
              threads: [thread, ...threads],
              activeThreadId: thread.id,
              messages: [],
              ideContextMode: thread.ideContextMode ?? 'enabled',
            };
          }

          const existing = visibleThreadForWorkspace(threads, nextPath);
          if (existing) {
            return {
              threads,
              activeThreadId: existing.id,
              messages: existing.messages,
              ideContextMode: existing.ideContextMode ?? 'enabled',
            };
          }

          const thread = createThread(workspaceFolderTitle(nextPath), nextPath);
          return {
            threads: [thread, ...threads],
            activeThreadId: thread.id,
            messages: [],
            ideContextMode: thread.ideContextMode ?? 'enabled',
          };
        });
      },

      selectThread: (id) => {
        const thread = get().threads.find((t) => t.id === id);
        if (!thread) return;
        set({
          activeThreadId: id,
          messages: thread.messages,
          ideContextMode: thread.ideContextMode ?? 'enabled',
        });
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
        if (get().isStreaming && isChatStopIntent(userText)) {
          get().stopStreaming();
          return;
        }
        if (
          !isDeliveryContinueRequest(userText) &&
          !isScaffoldContinueRequest(userText) &&
          !isArenaContinueRequest(userText) &&
          !isAgenticRepairRequest(userText)
        ) {
          deliveryWaveIndex = 0;
          agenticRepairWave = 0;
          useLiveAiEditsStore.getState().clearAll();
        }

        let editorState = useEditorStore.getState();
        let boundWorkspace = editorState.projectPath;

        // Code / Agentic / Debug / fashion scaffolds: auto-create Desktop (fallback Downloads).
        // Never invent a folder from SCAFFOLD_CONTINUE / repair system messages.
        const isSystemContinue =
          isScaffoldContinueRequest(userText) ||
          isDeliveryContinueRequest(userText) ||
          isAgenticRepairRequest(userText) ||
          isArenaContinueRequest(userText);

        if (
          (modeSupportsFileApply(get().agentMode) ||
            isFashionMatchingEngineRequest(userText)) &&
          !boundWorkspace?.trim()
        ) {
          if (isSystemContinue) {
            const userMsg: ChatMessage = {
              id: generateId(),
              role: 'user',
              content: userText,
              timestamp: Date.now(),
            };
            const assistantMsg: ChatMessage = {
              id: generateId(),
              role: 'assistant',
              content: '',
              error:
                'Workspace lipsă — redeschide folderul de proiect înainte de continuare (SCAFFOLD_CONTINUE).',
              timestamp: Date.now(),
            };
            const nextMessages = [...get().messages, userMsg, assistantMsg];
            set((s) => ({
              messages: nextMessages,
              threads: s.threads.map((t) =>
                t.id === s.activeThreadId
                  ? { ...t, messages: nextMessages, updatedAt: Date.now() }
                  : t
              ),
            }));
            return;
          }
          const ensured = await ensureDesktopProject(projectNameFromPrompt(userText));
          if (!ensured.ok || !ensured.path) {
            const userMsg: ChatMessage = {
              id: generateId(),
              role: 'user',
              content: userText,
              timestamp: Date.now(),
            };
            const assistantMsg: ChatMessage = {
              id: generateId(),
              role: 'assistant',
              content: '',
              error:
                ensured.error ??
                'Nu am putut crea un folder pe Desktop sau în Downloads. Deschide un folder manual.',
              timestamp: Date.now(),
            };
            const nextMessages = [...get().messages, userMsg, assistantMsg];
            set((s) => ({
              messages: nextMessages,
              threads: s.threads.map((t) =>
                t.id === s.activeThreadId
                  ? { ...t, messages: nextMessages, updatedAt: Date.now() }
                  : t
              ),
            }));
            return;
          }
          editorState = useEditorStore.getState();
          boundWorkspace = ensured.path;
          if (ensured.created) {
            const where =
              ensured.location === 'downloads' ? 'Downloads' : 'Desktop';
            showWorkbenchToast(
              tActive('toast.projectCreated', { where, path: ensured.path })
            );
          }
        }

        let {
          selectedModel,
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

        const attachmentsSnapshot = [...attachedFiles];
        let apiPrompt = userText;
        let fashionSeeded = false;
        let fashionSeedCount = 0;

        if (isFashionMatchingEngineRequest(userText) && editorState.projectPath) {
          const fashionArchetype = detectFashionArchetype(userText);
          const written = await seedFashionForRequest(editorState.projectPath, userText);
          if (written.length > 0) {
            fashionSeeded = true;
            fashionSeedCount = written.length;
            await editorState.refreshTree();
            const sep = editorState.projectPath.includes('\\') ? '\\' : '/';
            const pipelinePath = `${editorState.projectPath}${sep}fashion-matching-engine${sep}src${sep}fashion_matching${sep}pipeline.py`;
            void editorState.openFile(pipelinePath);
            apiPrompt = `${fashionMatchingSeedPrompt(fashionArchetype)}\n\n--- SPEC ---\n${userText.slice(0, 12000)}`;
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
          workspacePath: boundWorkspace ?? undefined,
          streamId: pendingStreamId ?? undefined,
          multiAgentStatus: isAgenticPipelineMode(agentMode) ? 'Memory…' : undefined,
          multiAgentSteps: isAgenticPipelineMode(agentMode)
              ? [{ phase: 'memory', status: 'active', detail: 'init', at: Date.now() }]
              : undefined,
          activitySteps: createInitialActivitySteps(prepReady, prepReady, routeHint),
        };

        const nextMessages = [...messages, userMsg, assistantMsg];
        sendAbortController?.abort();
        sendAbortController = new AbortController();
        userStoppedStream = false;
        pendingStreamId = generateId();
        activeStreamId = pendingStreamId;
        const sendSignal = sendAbortController.signal;
        set({ messages: nextMessages, isStreaming: true, attachedFiles: [] });

        try {
        if (isCavalloModesTestRequest(userText) && !cavalloCfg?.modesTestUseLlm) {
          set((s) => {
            const updated = s.messages.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content: CAVALLO_MODES_TEST_FIXTURE,
                    isStreaming: false,
                    resolvedModel: 'cavallo-modes-test',
                    activitySteps: markAllActivityDone(
                      m.activitySteps ?? createInitialActivitySteps()
                    ),
                  }
                : m
            );
            const updatedThreads = s.threads.map((t) =>
              t.id === activeThreadId
                ? { ...t, messages: updated, updatedAt: Date.now() }
                : t
            );
            return { messages: updated, threads: updatedThreads, isStreaming: false };
          });
          sendAbortController?.abort();
          sendAbortController = null;
          return;
        }

        const caval = (window as unknown as CavalWindow).caval;

        const mentionPaths = [
          ...parseMentions(apiPrompt),
          ...attachmentsSnapshot.map((f) => f.name),
        ];
        const uniqueMentions = [...new Set(mentionPaths)];
        const liveSelection = readLiveEditorSelection();
        const attachProject = shouldAttachProjectContext(apiPrompt, includeMode, {
          hasMentions: uniqueMentions.length > 0,
          hasAttachments: attachmentsSnapshot.length > 0,
          hasProjectPath: Boolean(editorState.projectPath),
          hasActiveSelection: Boolean(liveSelection?.text?.trim()),
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
          assertSendNotAborted(sendSignal);
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
        let composePhaseActive = false;

        const isSessionStale = () =>
          isStaleWorkspace(boundWorkspace, useEditorStore.getState().projectPath);

        const syncLiveEditorPreview = (buffer: string) => {
          if (!modeSupportsFileApply(agentMode)) return;
          const live = parseStreamingScaffold(buffer);
          if (live?.content.trim()) {
            useLiveAiEditsStore.getState().beginEdit(live.path);
            useLiveAiEditsStore.getState().progressEdit(live.path, live.content);
            return;
          }
          const peekPath = peekStreamingScaffoldPath(buffer);
          if (peekPath) {
            useLiveAiEditsStore.getState().beginEdit(peekPath);
          }
        };

        const openWrittenFile = async (relativePath: string): Promise<boolean> => {
          const projectPath = useEditorStore.getState().projectPath;
          if (!projectPath) return false;
          const sep = projectPath.includes('\\') ? '\\' : '/';
          const abs = `${projectPath}${sep}${relativePath.replace(/\//g, sep)}`;
          try {
            await useEditorStore.getState().openFile(abs);
            return true;
          } catch {
            return false;
          }
        };

        const finish = (content: string, extra?: Partial<ChatMessage>, tabPath?: string | null) => {
          if (userStoppedStream) return;
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
          const earlyDiskWrites = [
            ...new Set([
              ...(extra?.writtenFiles ?? []),
              ...toolWrittenPaths,
              ...pipelineWrittenFiles,
            ]),
          ];
          updateAssistant({
            content: finalContent,
            isStreaming: false,
            diff: diff ?? undefined,
            reasoningExpanded: false,
            ...extra,
            // Keep file list on the message even before async scaffold apply finishes.
            ...(extra?.proposedWrites?.length
              ? {}
              : earlyDiskWrites.length
                ? { writtenFiles: earlyDiskWrites }
                : {}),
          });
          set({ isStreaming: false });

          const projectPath = useEditorStore.getState().projectPath;
          const appliesScaffold = modeSupportsFileApply(agentMode);
          const skipScaffold =
            !appliesScaffold ||
            !projectPath ||
            extra?.error ||
            Boolean(extra?.proposedWrites?.length);
          const blockOnDiff = Boolean(diff);
          if (skipScaffold || blockOnDiff) {
            // Tool/pipeline writes already on disk — mark live strip done; keep until next chat.
            for (const f of earlyDiskWrites) {
              useLiveAiEditsStore.getState().completeEdit(f);
            }
            return;
          }

          void (async () => {
            try {
            if (isSessionStale()) {
              useEditorStore.getState().closeAiPreview();
              return;
            }
            let writtenFiles = fashionSeeded
              ? getFashionMatchingScaffoldFiles().map((f) => f.path)
              : [...new Set([...toolWrittenPaths, ...pipelineWrittenFiles])];

            let scaffoldErrors: string[] = [];
            let scaffoldParsed = 0;
            let scaffoldSkipped = 0;
            if (pipelineWrittenFiles.length === 0) {
              const parsed = parseScaffoldFiles(parseSource);
              scaffoldParsed = parsed.length;
              if (parsed.length > 0) {
                for (const f of parsed) {
                  useLiveAiEditsStore.getState().beginEdit(f.path);
                }
                const applied = await applyScaffoldToWorkspace(projectPath, parsed);
                writtenFiles = [...writtenFiles, ...applied.written];
                scaffoldErrors = applied.errors;
                scaffoldSkipped = applied.skipped;
                for (const w of applied.written) {
                  useLiveAiEditsStore.getState().completeEdit(w);
                }
                for (const err of applied.errors) {
                  const path = err.split(':')[0]?.trim();
                  if (path) useLiveAiEditsStore.getState().failEdit(path);
                }
              }
            }
            writtenFiles = [...new Set(writtenFiles)];
            await useEditorStore.getState().refreshTree();
            const recapText = msgForParse?.recap ?? capturedRecapMeta?.pendingIssues?.join(' ');
            const gate = capturedRecapMeta?.completionGate;
            const fullDelivery: FullDeliveryConfig =
              capturedRecapMeta?.fullDelivery ?? DEFAULT_FULL_DELIVERY_CONFIG;
            const incomplete = isDeliveryBlocked(
              {
                writtenFiles,
                recap: recapText,
                taskCount: capturedRecapMeta?.taskCount ?? 0,
                parseSource,
              },
              gate
            );

            const planContext =
              gate?.suggestedContinueMessage?.trim() ||
              reasoningWithFences ||
              msgForParse?.reasoning ||
              (capturedReasoningBrief
                ? [capturedReasoningBrief.goal, capturedReasoningBrief.approach].join('\n')
                : '');

            const tryAgenticAutonomousRepair = (label: string, verifyOutput?: string): boolean => {
              if (!isAgenticPipelineMode(agentMode) || isSessionStale()) return false;
              if (!canAutoContinueRepair(agenticRepairWave, fullDelivery)) return false;
              agenticRepairWave += 1;
              updateAssistant({
                error: undefined,
                content: `${label} (${agenticRepairWave}/${fullDelivery.maxRepairWaves})…`,
                multiAgentStatus: 'Repair…',
              });
              void get().sendMessage(
                buildAgenticRepairMessage({
                  wave: agenticRepairWave - 1,
                  gate,
                  verifyOutput,
                  planContext,
                })
              );
              return true;
            };

            if (isAgenticPipelineMode(agentMode) && incomplete) {
              if (tryAgenticAutonomousRepair('Autonomous repair')) return;
              if (
                canAutoContinueDelivery(deliveryWaveIndex, fullDelivery) &&
                !isSessionStale()
              ) {
                deliveryWaveIndex += 1;
                updateAssistant({
                  error: undefined,
                  content: `Continuă delivery (${deliveryWaveIndex}/${fullDelivery.maxComposeWaves})…`,
                  multiAgentStatus: 'Delivery…',
                });
                void get().sendMessage(
                  buildDeliveryContinueMessage(planContext, deliveryWaveIndex - 1)
                );
                return;
              }
              if (gate && !gate.ok) {
                updateAssistant({
                  error: gate.issues.map((i) => `[${i.code}] ${i.message}`).join('\n').slice(0, 800),
                  content: `Autonomie epuizată (${fullDelivery.maxRepairWaves} repair waves). Issues rămase:`,
                });
                return;
              }
            }

            if (writtenFiles.length === 0) {
              useEditorStore.getState().closeAiPreview();
              // Retry AI emission only when fences existed but apply failed.
              if (
                scaffoldParsed > 0 &&
                modeSupportsFileApply(agentMode) &&
                fullDelivery.autonomousFinish &&
                canAutoContinueRepair(agenticRepairWave, fullDelivery) &&
                !isSessionStale()
              ) {
                agenticRepairWave += 1;
                updateAssistant({
                  content: `Emit fișiere (${agenticRepairWave}/${fullDelivery.maxRepairWaves})…`,
                  multiAgentStatus: 'Scaffold…',
                });
                void get().sendMessage(buildScaffoldContinueUserMessage(planContext));
                return;
              }

              const fallback = await applyFallbackScaffold(projectPath, {
                projectName: workspaceFolderTitle(projectPath),
              });
              if (fallback.written.length > 0) {
                writtenFiles = [
                  ...fallback.written.filter((f) => f !== 'src/App.tsx'),
                  ...(fallback.written.includes('src/App.tsx') ? ['src/App.tsx'] : []),
                ];
                showWorkbenchToast(FALLBACK_SCAFFOLD_TOAST);
                const prevTl =
                  get().messages.find((m) => m.id === assistantMsgId)?.timelineEvents ?? [];
                updateAssistant({
                  error: undefined,
                  content: FALLBACK_SCAFFOLD_TOAST,
                  writtenFiles,
                  timelineEvents: [...prevTl, buildFallbackScaffoldTimelineEvent()],
                  timelineExpanded: true,
                });
                await useEditorStore.getState().refreshTree();
              } else {
                const hadReasoningPlan = Boolean(
                  reasoningWithFences ||
                    msgForParse?.reasoning?.trim() ||
                    capturedReasoningBrief
                );
                const expectsDelivery =
                  looksLikeFileCreationPrompt(userText) ||
                  hadReasoningPlan ||
                  scaffoldParsed > 0 ||
                  isScaffoldContinueRequest(userText);
                if (!expectsDelivery) {
                  return;
                }
                const detail =
                  fallback.errors[0] ||
                  scaffoldErrors[0] ||
                  (scaffoldParsed > 0 && scaffoldSkipped === scaffoldParsed
                    ? 'Blocurile de cod au fost filtrate (path invalid / fragment / junk).'
                    : scaffoldParsed === 0
                      ? 'Răspunsul nu conține blocuri ```lang:path``` de scris pe disc.'
                      : '');
                updateAssistant({
                  error: hadReasoningPlan
                    ? `AI a planificat, dar nu a scris fișiere valide în workspace.${detail ? `\n${detail}` : ''}\nReformulează promptul (cere explicit fișiere cu path) sau retrimite.`
                    : `Niciun fișier scris în workspace (folder: ${workspaceFolderTitle(projectPath)}).${detail ? `\n${detail}` : ''}\nRetrimite promptul sau cere „creează fișierele în proiect”.`,
                });
                return;
              }
            }

            // AI wrote sources but forgot package.json / scripts.dev → make Preview runnable.
            if (
              writtenFiles.length > 0 &&
              !(await workspaceHasRunnableWebProject(projectPath))
            ) {
              const filled = await applyFallbackScaffold(projectPath, {
                projectName: workspaceFolderTitle(projectPath),
              });
              if (filled.written.length > 0) {
                writtenFiles = [...new Set([...writtenFiles, ...filled.written])];
                showWorkbenchToast(FALLBACK_RUNNABLE_TOAST);
              }
            }

            const lastFile = writtenFiles[writtenFiles.length - 1]!;
            for (const f of writtenFiles) {
              useLiveAiEditsStore.getState().completeEdit(f);
            }
            const opened = await openWrittenFile(lastFile);
            if (opened) {
              useEditorStore.getState().closeAiPreview();
            }

            let devToolsForRecap = capturedRecapMeta?.devTools;
            const fullDeliveryRecap: FullDeliveryConfig =
              capturedRecapMeta?.fullDelivery ?? DEFAULT_FULL_DELIVERY_CONFIG;
            if (!devToolsForRecap?.verify?.ran && window.caval?.workspaceVerify) {
              const verifyRes = await window.caval.workspaceVerify(projectPath, {
                autoInstall: fullDeliveryRecap.autoInstallDependencies,
                writtenFiles,
              });
              if (verifyRes.ok && verifyRes.verify) {
                devToolsForRecap = { ...devToolsForRecap, verify: verifyRes.verify };
              }
            }

            const verifyFailed = devToolsForRecap?.verify?.commands?.find((c) => !c.ok);
            const recapPatch: Partial<ChatMessage> = { writtenFiles };
            if (capturedRecapMeta) {
              recapPatch.pipelineRecapMeta = capturedRecapMeta;
            }
            if (verifyFailed) {
              recapPatch.error = `Verificare eșuată: ${verifyFailed.command}\n${verifyFailed.output.slice(0, 500)}`;
            } else if (devToolsForRecap?.verify?.ran) {
              recapPatch.content = `✓ Verificare: ${devToolsForRecap.verify.summary}`;
            }

            if (isAgenticPipelineMode(agentMode) && DEFAULT_REASONING_LAYER_CONFIG.showFinalRecap) {
              const projectTitle = workspaceFolderTitle(projectPath);
              const needsReview = Boolean(capturedRecapMeta?.needsReview);
              const verifyPending = Boolean(capturedRecapMeta?.verifyPending);
              const brief = capturedReasoningBrief ?? briefFromContext(userText);
              const recap = buildProjectCompletionRecap({
                projectTitle,
                writtenFiles,
                userMessage: userText,
                brief,
                recapMeta: capturedRecapMeta,
                needsReview,
                verifyPending,
              });
              recapPatch.recap = recap;
              recapPatch.content = formatArenaReasoning(brief, recap, false);
              recapPatch.multiAgentStatus = `Gata · ${projectTitle}`;
              if (verifyFailed) {
                recapPatch.error = `Verificare eșuată: ${verifyFailed.command}\n${verifyFailed.output.slice(0, 500)}`;
              }
              if (projectPath === boundWorkspace) {
                showWorkbenchToast(
                  buildProjectCompletionToast({
                    projectTitle,
                    writtenFiles,
                    needsReview,
                    verifyPending,
                  }),
                  6000
                );
              }
            } else if (isAgenticPipelineMode(agentMode) && capturedReasoningBrief) {
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

            if (
              isAgenticPipelineMode(agentMode) &&
              verifyFailed &&
              fullDeliveryRecap.autonomousFinish &&
              !isSessionStale()
            ) {
              const verifyOutput = `${verifyFailed.command}\n${verifyFailed.output}`;
              if (
                tryAgenticAutonomousRepair(
                  'Verify repair',
                  verifyOutput
                )
              ) {
                return;
              }
            }
            } catch (deliveryErr) {
              const msg =
                deliveryErr instanceof Error ? deliveryErr.message : String(deliveryErr);
              updateAssistant({ error: `Delivery eșuat: ${msg}` });
              console.error('[caval] finish delivery error:', deliveryErr);
            }
          })();
        };

        if (
          !fashionSeeded &&
          !isDeliveryContinueRequest(userText) &&
          !isScaffoldContinueRequest(userText)
        ) {
          const readiness = await checkModelReadiness(selectedModel, get().apiKeys);
          assertSendNotAborted(sendSignal);
          if (!readiness.ready) {
            finish(`${readiness.reason}\n\n${readiness.hint}`, { error: readiness.reason });
            return;
          }
        }

        if (isFashionMatchingEngineRequest(userText) && !editorState.projectPath) {
          const ensured = await ensureDesktopProject(projectNameFromPrompt(userText));
          if (!ensured.ok || !ensured.path) {
            finish(
              ensured.error ??
                'Nu am putut crea un folder pe Desktop/Downloads pentru fashion-matching-engine.',
              { error: 'projectPath lipsă' }
            );
            return;
          }
          editorState = useEditorStore.getState();
        }

        if (isAgenticPipelineMode(agentMode) && !editorState.projectPath && !fashionSeeded) {
          const ensured = await ensureDesktopProject(projectNameFromPrompt(userText));
          if (!ensured.ok || !ensured.path) {
            finish(
              ensured.error ??
                'Nu am putut crea un folder pe Desktop sau în Downloads — fără proiect nu pot crea fișiere.',
              { error: 'projectPath lipsă' }
            );
            return;
          }
          editorState = useEditorStore.getState();
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
          if (userStoppedStream) return;
          if (isSessionStale()) {
            if (chunk.type === 'done' || chunk.type === 'error') {
              finish('Workspace schimbat — stream oprit.', { error: 'workspace-changed' });
              streamCleanup?.();
              streamCleanup = null;
            }
            return;
          }
          if (chunk.type === 'timeline' && chunk.event) {
            const event = sanitizeTimelineEvent(chunk.event);
            const prev = get().messages.find((m) => m.id === assistantMsgId);
            if (!prev) return;
            if (chunk.streamId && prev.streamId && chunk.streamId !== prev.streamId) return;
            const existing = prev.timelineEvents ?? [];
            if (existing.some((e) => e.id === event.id)) return;
            const patch: Partial<ChatMessage> = {
              timelineEvents: [...existing, event],
              timelineExpanded: true,
            };
            if (event.type === 'file_write' && event.filePath) {
              const files = [...(prev.writtenFiles ?? [])];
              if (!files.includes(event.filePath)) {
                files.push(event.filePath);
                patch.writtenFiles = files;
              }
              useLiveAiEditsStore.getState().beginEdit(event.filePath);
              useLiveAiEditsStore.getState().completeEdit(event.filePath);
            } else if (
              (event.type === 'tool_call' || event.type === 'tool_result') &&
              event.filePath
            ) {
              useLiveAiEditsStore.getState().beginEdit(event.filePath);
            }
            updateAssistant(patch);
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
              chunk.detail,
              chunk.multiAgentModel,
              chunk.multiAgentStepId,
              chunk.multiAgentAuditBadge,
              chunk.multiAgentParallelGroup
            );
            updateAssistant({ multiAgentStatus: label, multiAgentSteps });
            if (phase === 'compose') {
              composePhaseActive = chunkStatus === 'active';
            }
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
          if (chunk.type === 'tool' && chunk.toolName === 'write_file') {
            if (isSessionStale()) return;
            const relPath =
              chunk.toolWrittenPath ??
              chunk.toolDetail?.match(/"path"\s*:\s*"([^"]+)"/)?.[1];
            if (relPath) {
              useLiveAiEditsStore.getState().beginEdit(relPath);
              if (chunk.toolStatus === 'done') {
                toolWrittenPaths.push(relPath);
                useLiveAiEditsStore.getState().completeEdit(relPath);
                void openWrittenFile(relPath);
                void useEditorStore.getState().refreshTree();
                const prevFiles =
                  get().messages.find((m) => m.id === assistantMsgId)?.writtenFiles ?? [];
                if (!prevFiles.includes(relPath)) {
                  updateAssistant({ writtenFiles: [...prevFiles, relPath] });
                }
              }
            }
          }
          if (chunk.type === 'delta' && chunk.delta) {
            if (!isTranscriptVisibleKind(chunk.kind)) {
              return;
            }
            if (!gotFirstDelta) {
              gotFirstDelta = true;
              updateActivity('think', 'done');
              updateActivity('write', 'active');
            }
            rawStreamBuffer += chunk.delta;
            activeStreamBuffer = rawStreamBuffer;
            if (isAgenticPipelineMode(agentMode) && composePhaseActive) {
              updateAssistant({ multiAgentStatus: 'Compose…' });
              return;
            }
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
            if (userStoppedStream || chunk.error === 'Aborted') return;
            finish(`Eroare: ${chunk.error ?? 'necunoscută'}`, { error: chunk.error }, activeTabPath);
            streamCleanup?.();
            streamCleanup = null;
          }
          if (chunk.type === 'done') {
            const resolved = chunk.model ?? get().messages.find((m) => m.id === assistantMsgId)?.resolvedModel;
            if (resolved) set({ activeResolvedModel: resolved });
            if (chunk.runId) {
              updateAssistant({ pipelineRunId: chunk.runId });
            }
            if (chunk.reasoningBrief) capturedReasoningBrief = chunk.reasoningBrief;
            if (chunk.pipelineRecapMeta) {
              capturedRecapMeta = {
                ...(chunk.pipelineRecapMeta as PipelineRecapMeta),
                completionGate:
                  (chunk as { completionGate?: PipelineRecapMeta['completionGate'] }).completionGate ??
                  (chunk.pipelineRecapMeta as PipelineRecapMeta).completionGate,
                deliveryBlocked:
                  (chunk as { deliveryBlocked?: boolean }).deliveryBlocked ??
                  (chunk.pipelineRecapMeta as PipelineRecapMeta).deliveryBlocked,
                needsReview:
                  (chunk as { needsReview?: boolean }).needsReview ??
                  (chunk.pipelineRecapMeta as PipelineRecapMeta).needsReview,
                verifyPending:
                  (chunk as { verifyPending?: boolean }).verifyPending ??
                  (chunk.pipelineRecapMeta as PipelineRecapMeta).verifyPending,
                fullDelivery:
                  (chunk.pipelineRecapMeta as PipelineRecapMeta).fullDelivery ??
                  DEFAULT_FULL_DELIVERY_CONFIG,
              };
            }
            if (chunk.composeText?.trim()) {
              capturedComposeText = chunk.composeText;
              syncLiveEditorPreview(chunk.composeText);
            }
            if (chunk.writtenFiles?.length) {
              pipelineWrittenFiles = chunk.writtenFiles;
            }
            const proposedWrites = chunk.proposedWrites ?? [];
            const proposeStageKey = chunk.proposeStageKey;
            if (proposedWrites.length) {
              useLiveAiEditsStore.getState().setProposed(proposedWrites);
            }
            if (pipelineWrittenFiles.length) {
              for (const f of pipelineWrittenFiles) {
                useLiveAiEditsStore.getState().completeEdit(f);
              }
            }
            updateAssistant({
              isStreaming: false,
              ...(pipelineWrittenFiles.length ? { writtenFiles: pipelineWrittenFiles } : {}),
              ...(proposedWrites.length
                ? { proposedWrites, proposeStageKey, writtenFiles: [] }
                : {}),
            });
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
                ...(proposedWrites.length
                  ? { proposedWrites, proposeStageKey, writtenFiles: [] as string[] }
                  : {}),
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
          if (userStoppedStream || sendSignal.aborted) return;

          const streamId = pendingStreamId ?? generateId();
          pendingStreamId = null;
          activeStreamId = streamId;
          updateAssistant({ streamId });
          abortController = new AbortController();
          activeStreamBuffer = '';
          rawStreamBuffer = '';
          gotFirstDelta = false;
          activeTabPath = streamContext.filePath ?? null;

          streamCleanup = caval?.chatStream?.(
            {
              message: apiPrompt,
              model: selectedModel,
              mode: agentMode === 'ask' ? 'ask' : agentMode,
              streamId,
              workspaceRoot: boundWorkspace ?? undefined,
              conversationId: get().activeThreadId,
              assistantMessageId: assistantMsgId,
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
              ...(get().ideContextMode !== 'disabled'
                ? (() => {
                    const ideContext = collectRendererIdeContext();
                    return ideContext ? { ideContext } : {};
                  })()
                : {}),
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
          const syncRes = await caval?.workspaceSync?.(editorState.projectPath);
          if (syncRes && syncRes.ok === false) {
            finish(
              `Nu pot lega workspace-ul: ${syncRes.error ?? 'sync eșuat'}.\nDeschide din nou folderul (File → Open Folder).`,
              { error: 'workspace-sync-failed' }
            );
            return;
          }
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

        const scaffoldMode = modeSupportsFileApply(agentMode);

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
            assertSendNotAborted(sendSignal);
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

        assertSendNotAborted(sendSignal);
        projectContext = mergeProjectContextWithBootstrap(projectContext, workspaceBootstrap);

        // Silent universal software context (category + platform + 2026 trends). No UI.
        try {
          const webCtx = buildUniversalWebContext(apiPrompt || userText, {
            force: modeSupportsFileApply(agentMode),
          });
          projectContext = mergeProjectContextWithWebContext(projectContext, webCtx);
        } catch {
          /* ignore detection failures */
        }

        const mentionFiles =
          uniqueMentions.length > 0 && caval?.fs?.readFile
            ? await resolveMentionFiles(
                uniqueMentions,
                editorState.projectPath,
                (p) => caval.fs!.readFile!(p)
              )
            : [];

        assertSendNotAborted(sendSignal);

        const editorSelection = liveSelection ?? useEditorStore.getState().editorSelection;
        const selectionText = editorSelection?.text?.trim() || undefined;

        assertSendNotAborted(sendSignal);

        const contextMessages: AIMessage[] = buildContextMessages(
          apiPrompt,
          messages.map((m) => ({ role: m.role, content: m.content })),
          {
            activeTab,
            selection: selectionText,
            fileTree: attachProject && !isAgenticPipelineMode(agentMode) ? editorState.fileTree : [],
            projectPath: editorState.projectPath,
            includeMode:
              selectionText && includeMode === 'selection'
                ? 'selection'
                : attachProject
                  ? includeMode === 'selection'
                    ? 'project'
                    : includeMode
                  : 'file',
            skipActiveFile: !attachProject,
            projectContext,
            mentions: uniqueMentions,
            mentionFiles,
            attachments: attachmentsSnapshot,
            agentMode,
            cavalloModesTestLlm:
              cavalloCfg?.modesTestUseLlm === true && isCavalloModesTestRequest(userText),
          }
        );

        if (isByokModel(selectedModel)) {
          try {
            assertRendererChatAllowed({
              prompt: apiPrompt,
              workspaceRoot: editorState.projectPath,
              capability: agentMode === 'plan' ? 'planning' : 'chat',
              intent: agentMode === 'debug' ? 'debug' : 'kilocode',
            });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            finish(`Eroare: ${msg}`, { error: msg }, activeTab?.path);
            return;
          }
          // Stream via main IPC so OPENAI/ANTHROPIC/GOOGLE keys come from secrets file
          // (renderer only holds `__configured__` markers, never plaintext Bearer tokens).
          startIpcStream(contextMessages, {
            filePath: attachProject ? activeTab?.path : undefined,
            fileContent: attachProject ? activeTab?.content : undefined,
            projectContext,
          }, scaffoldMode);
          return;
        }

        startIpcStream(contextMessages, {
          filePath: attachProject ? activeTab?.path : undefined,
          fileContent: attachProject ? activeTab?.content : undefined,
          projectContext,
        }, scaffoldMode);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        throw err;
      }
      },

      stopStreaming: () => {
        userStoppedStream = true;
        sendAbortController?.abort();
        sendAbortController = null;
        const sid = activeStreamId ?? pendingStreamId;
        abortController?.abort();
        if (sid) {
          void getCaval()?.abortChatStream?.(sid);
        }
        streamCleanup?.();
        streamCleanup = null;
        activeStreamId = null;
        pendingStreamId = null;
        useLiveAiEditsStore.getState().clearAll();
        useAiWorkCanvasStore.getState().onStreamEnd();
        set((s) => {
          const messages = s.messages.map((m) =>
            m.isStreaming ? finalizeStoppedAssistantMessage(m) : m
          );
          const threads = s.threads.map((t) =>
            t.id === s.activeThreadId ? { ...t, messages, updatedAt: Date.now() } : t
          );
          return { isStreaming: false, messages, threads };
        });
      },

      clearChat: () => {
        useLiveAiEditsStore.getState().clearAll();
        set((s) => {
          const updatedThreads = s.threads.map((t) =>
            t.id === s.activeThreadId ? { ...t, messages: [], title: tActive('ai.panel.newChat') } : t
          );
          return { messages: [], threads: updatedThreads };
        });
      },

      applyDiff: async (messageId) => {
        const msg = get().messages.find((m) => m.id === messageId);
        if (!msg?.diff || msg.diff.applied || msg.diff.rejected) return;
        const tabBefore = useEditorStore.getState().tabs.find((t) => t.path === msg.diff!.filePath);
        const previousContent = tabBefore?.content;
        const result = await applyDiffToWorkspace(msg.diff);
        if (!result.ok) return;

        patchMessageInThreads(set, messageId, (m) =>
          m.diff
            ? {
                ...m,
                diff: {
                  ...m.diff,
                  applied: true,
                  previousContent: m.diff.previousContent ?? previousContent,
                },
              }
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
        const outputStore = useOutputStore.getState();
        outputStore.append('CAVAL', `▶ Verificare workspace: ${projectPath}`);
        try {
          const res = await caval.workspaceVerify(projectPath);
          if (!res.ok || !res.verify) {
            outputStore.append('CAVAL', `✗ ${res.error ?? 'Verificare eșuată.'}`);
            appendChatReportMessage(
              set,
              `**Verificare workspace**\n\n${res.error ?? 'Verificare eșuată.'}`,
              { error: res.error ?? 'verify failed' }
            );
            set({ pendingChatDraft: 'fixează erorile de mai sus' });
            dispatchTerminalPanelTab('output');
            return;
          }
          const allOk = !res.verify.commands.length || res.verify.commands.every((c) => c.ok);
          for (const c of res.verify.commands) {
            const status = c.ok ? '✓' : '✗';
            outputStore.appendBlock('CAVAL', `${status} ${c.command} (exit ${c.exitCode ?? 'n/a'})\n${c.output}`);
            const parsed = parseProblemsFromOutput(c.output, c.command);
            if (parsed.length) {
              useProblemsStore.getState().mergeProblems(parsed, c.command);
            }
          }
          if (!allOk) {
            dispatchTerminalPanelTab('problems');
          } else {
            dispatchTerminalPanelTab('output');
          }
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
        const outputStore = useOutputStore.getState();
        outputStore.append('CAVAL', `▶ Build: npm run build @ ${projectPath}`);
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
          outputStore.appendBlock(
            'CAVAL',
            `${ok ? '✓' : '✗'} ${command} (exit ${exitCode ?? 'n/a'})\n${output}`
          );
          const parsed = parseProblemsFromOutput(output, 'build');
          if (parsed.length) {
            useProblemsStore.getState().mergeProblems(parsed, 'build');
            dispatchTerminalPanelTab('problems');
          } else {
            dispatchTerminalPanelTab('output');
          }
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

      queueChatFromPanel: (text, options) => {
        const draft = text.trim();
        if (!draft) return;
        set({
          pendingChatDraft: draft,
          pendingAutoSend: options?.autoSend ?? false,
        });
        window.dispatchEvent(new CustomEvent(CAVAL_OPEN_CODING_CHAT_EVENT));
      },

      handoffFromEngineering: async ({ project, userPrompt }) => {
        const boot = await bootstrapRoboticsDesktopProject({
          project,
          userPrompt,
        });
        const projectPath = useEditorStore.getState().projectPath || boot.path;
        if (!boot.ok || !projectPath) {
          return {
            ok: false as const,
            error:
              boot.error ??
              'Nu am putut crea/deschide folderul de proiect pe Desktop.',
          };
        }

        const title = project.spec.title.trim().slice(0, 48) || 'Software din Engineering';
        const contextMarkdown = formatEngineeringContextForCoding(project, userPrompt);
        const suggestedPrompt = buildSoftwareHandoffPrompt(project, userPrompt);
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
              name: `Robotics AI — ${project.spec.title.slice(0, 40)}`,
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
        // Keep caval-auto/free as default for users without cloud keys.
        if (
          state.selectedModel === 'caval-auto/balanced' ||
          state.selectedModel === 'caval-auto/frontier'
        ) {
          void getCaval()?.secretsGet?.().then((res) => {
            if (!res?.configured?.OPENROUTER_API_KEY) {
              useAIStore.setState({ selectedModel: 'caval-auto/free' });
            }
          });
        }
        state.threads = migrateThreadsOnRehydrate(state.threads, state.activeThreadId);
        state.threads = state.threads.map((t) => ({
          ...t,
          ideContextMode: t.ideContextMode === 'disabled' ? 'disabled' : 'enabled',
        }));
        const thread = state.threads.find((t) => t.id === state.activeThreadId);
        if (thread) {
          state.messages = thread.messages;
          state.ideContextMode = thread.ideContextMode ?? 'enabled';
        } else {
          state.ideContextMode = 'enabled';
        }
        state.isStreaming = false;
        state.messages = state.messages.map((m) =>
          m.isStreaming ? { ...m, isStreaming: false } : m
        );
        state.threads = state.threads.map((t) => ({
          ...t,
          messages: t.messages.map((m) =>
            m.isStreaming ? { ...m, isStreaming: false } : m
          ),
        }));
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
        if (legacyMode === 'build' || legacyMode === 'release') {
          state.agentMode = 'code';
        }
        if (!AGENT_MODES.some((m) => m.id === state.agentMode)) {
          state.agentMode = 'code';
        }
        void loadApiKeysFromSecrets().then((apiKeys) => {
          useAIStore.setState({ apiKeys });
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
