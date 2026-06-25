import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  createProvider,
  type AIMessage,
  type ApiKeys,
} from '../multi-model/provider';
import type { ModelSelectionId } from '../models/model-catalog';
import { getAgentMode, type AgentModeId } from '../modes/agent-modes';
import { buildContextMessages, parseMentions } from '../context-engine/context-builder';
import { useEditorStore } from '../../src/renderer/store/editor-store';
import type { CavalStreamChunk } from '../../src/main/preload';

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
}

export interface DetectedDiff {
  filePath: string;
  original: string;
  modified: string;
  language: string;
  applied: boolean;
}

export interface ChatThread {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
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
        context?: Record<string, unknown>;
      },
      onChunk: (chunk: CavalStreamChunk) => void
    ) => () => void;
    contextSearch?: (input: { query: string; limit?: number }) => Promise<{ ok: boolean; results?: Array<{ path?: string; content?: string; snippet?: string }> }>;
    modelsList?: () => Promise<{ catalog?: { all: Array<{ id: string; label: string; color: string }> } }>;
    resolveModel?: (input: { model: string; intent?: string }) => Promise<{
      ok: boolean;
      resolved?: { modelId: string; provider: string; reason: string };
    }>;
    secretsGet?: () => Promise<{ ok: boolean; secrets?: Record<string, string> }>;
    secretsSet?: (secrets: Record<string, string>) => Promise<{ ok: boolean }>;
    fs?: {
      pickFiles?: () => Promise<string[] | null>;
      readFile?: (filePath: string) => Promise<{ ok: boolean; content?: string; error?: string }>;
    };
  };
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
  includeMode: IncludeMode;
  setIncludeMode: (mode: IncludeMode) => void;
  attachedFiles: ChatAttachment[];
  addAttachments: (paths: string[]) => Promise<void>;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
  newThread: () => void;
  selectThread: (id: string) => void;
  deleteThread: (id: string) => void;

  sendMessage: (userText: string) => Promise<void>;
  stopStreaming: () => void;
  clearChat: () => void;
  applyDiff: (messageId: string) => void;
  rejectDiff: (messageId: string) => void;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createThread(): ChatThread {
  const id = generateId();
  return { id, title: 'Chat nou', messages: [], createdAt: Date.now(), updatedAt: Date.now() };
}

function detectDiff(content: string, activeTabPath: string | null): DetectedDiff | undefined {
  const diffMatch = content.match(/```diff\n([\s\S]+?)```/);
  if (!diffMatch || !activeTabPath) return undefined;
  const diffText = diffMatch[1];
  const removedLines = diffText.split('\n').filter((l) => l.startsWith('-')).map((l) => l.slice(1)).join('\n');
  const addedLines = diffText.split('\n').filter((l) => l.startsWith('+')).map((l) => l.slice(1)).join('\n');
  if (!addedLines) return undefined;
  return {
    filePath: activeTabPath,
    original: removedLines,
    modified: addedLines,
    language: 'typescript',
    applied: false,
  };
}

const BYOK_IDS = new Set([
  'claude-opus-4', 'claude-sonnet-4', 'gpt-4o', 'gpt-4o-mini',
  'gemini-2.5-pro', 'gemini-2.5-flash', 'ollama-local',
]);

function isByokModel(id: ModelSelectionId): boolean {
  return BYOK_IDS.has(id);
}

function attachmentName(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || filePath;
}

const getCaval = (): CavalWindow['caval'] => (window as unknown as CavalWindow).caval;

const persistApiKeys = async (apiKeys: ApiKeys): Promise<void> => {
  await getCaval()?.secretsSet?.(apiKeys as Record<string, string>);
};

const loadApiKeysFromSecrets = async (): Promise<ApiKeys> => {
  const result = await getCaval()?.secretsGet?.();
  return (result?.secrets ?? {}) as ApiKeys;
};

let abortController: AbortController | null = null;
let streamCleanup: (() => void) | null = null;

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
      attachedFiles: [],
      activeThreadId: initialThread.id,
      threads: [initialThread],
      messages: [],
      isStreaming: false,

      setModel: (id) => {
        set({ selectedModel: id, activeResolvedModel: null });
        void get().refreshResolvedModel();
      },
      setAgentMode: (mode) => {
        const modeDef = getAgentMode(mode);
        set({ agentMode: mode, selectedModel: modeDef.defaultModel, activeResolvedModel: null });
        void get().refreshResolvedModel();
      },
      setIncludeMode: (mode) => set({ includeMode: mode }),

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

      newThread: () => {
        const thread = createThread();
        set((s) => ({
          threads: [thread, ...s.threads],
          activeThreadId: thread.id,
          messages: [],
        }));
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

      sendMessage: async (userText) => {
        const {
          selectedModel,
          apiKeys,
          messages,
          includeMode,
          agentMode,
          activeThreadId,
          attachedFiles,
        } = get();
        const modeDef = getAgentMode(agentMode);
        const attachmentsSnapshot = [...attachedFiles];

        const userMsg: ChatMessage = {
          id: generateId(),
          role: 'user',
          content: userText,
          timestamp: Date.now(),
        };

        const assistantMsgId = generateId();
        const assistantMsg: ChatMessage = {
          id: assistantMsgId,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          model: selectedModel,
          isStreaming: true,
        };

        const nextMessages = [...messages, userMsg, assistantMsg];
        set({ messages: nextMessages, isStreaming: true, attachedFiles: [] });

        const editorState = useEditorStore.getState();
        const activeTab = editorState.tabs.find((t) => t.id === editorState.activeTabId) ?? null;
        const mentionPaths = [
          ...parseMentions(userText),
          ...attachmentsSnapshot.map((f) => f.name),
        ];
        const uniqueMentions = [...new Set(mentionPaths)];

        let projectContext = '';
        const caval = (window as unknown as CavalWindow).caval;
        if (includeMode === 'project' && caval?.contextSearch) {
          try {
            const search = await caval.contextSearch({ query: userText, limit: 8 });
            if (search.ok && search.results?.length) {
              projectContext = search.results
                .map((r) => `File: ${r.path ?? 'unknown'}\n${r.snippet ?? r.content ?? ''}`)
                .join('\n\n---\n\n');
            }
          } catch { /* ignore */ }
        }

        const contextMessages: AIMessage[] = buildContextMessages(
          userText,
          messages.map((m) => ({ role: m.role, content: m.content })),
          {
            activeTab,
            fileTree: editorState.fileTree,
            projectPath: editorState.projectPath,
            includeMode,
            projectContext,
            mentions: uniqueMentions,
            attachments: attachmentsSnapshot,
          }
        );

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

        const finish = (content: string, extra?: Partial<ChatMessage>) => {
          const diff = detectDiff(content, activeTab?.path ?? null);
          updateAssistant({ content, isStreaming: false, diff, ...extra });
          set({ isStreaming: false });
        };

        if (isByokModel(selectedModel)) {
          let provider;
          try {
            provider = createProvider(selectedModel as never, apiKeys);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            finish(`Eroare: ${msg}`, { error: msg });
            return;
          }

          abortController = new AbortController();
          let fullContent = '';
          try {
            await provider.streamChat(
              contextMessages,
              ({ delta, done, error }) => {
                if (error) {
                  finish(`Eroare API: ${error}`, { error });
                  return;
                }
                fullContent += delta;
                if (done) {
                  finish(fullContent, { resolvedModel: selectedModel });
                  set({ activeResolvedModel: selectedModel });
                }
                else updateAssistant({ content: fullContent });
              },
              abortController.signal
            );
          } catch (err: unknown) {
            if (err instanceof Error && err.name !== 'AbortError') {
              finish(`Eroare de rețea: ${err.message}`, { error: err.message });
            }
          }
          return;
        }

        const streamId = generateId();
        abortController = new AbortController();

        streamCleanup = caval?.chatStream?.(
          {
            message: userText,
            model: selectedModel,
            mode: agentMode === 'ask' ? 'ask' : agentMode,
            streamId,
            context: {
              filePath: activeTab?.path,
              fileContent: activeTab?.content,
              projectContext,
              mentions: uniqueMentions,
              attachments: attachmentsSnapshot.map((f) => ({
                path: f.path,
                name: f.name,
                content: f.content.slice(0, 16_000),
              })),
            },
          },
          (chunk: CavalStreamChunk) => {
            if (chunk.type === 'meta' && chunk.resolvedModel) {
              updateAssistant({ resolvedModel: chunk.resolvedModel });
              set({ activeResolvedModel: chunk.resolvedModel });
            }
            if (chunk.type === 'delta' && chunk.delta) {
              const current = get().messages.find((m) => m.id === assistantMsgId);
              updateAssistant({ content: (current?.content ?? '') + chunk.delta });
            }
            if (chunk.type === 'error') {
              finish(`Eroare: ${chunk.error ?? 'necunoscută'}`, { error: chunk.error });
              streamCleanup?.();
              streamCleanup = null;
            }
            if (chunk.type === 'done') {
              const current = get().messages.find((m) => m.id === assistantMsgId);
              const resolved = chunk.model ?? current?.resolvedModel;
              if (resolved) set({ activeResolvedModel: resolved });
              finish(current?.content ?? '', { resolvedModel: resolved });
              streamCleanup?.();
              streamCleanup = null;
            }
          }
        ) ?? null;

        if (!streamCleanup) {
          finish('IPC streaming indisponibil. Repornește aplicația.');
        }
      },

      stopStreaming: () => {
        abortController?.abort();
        streamCleanup?.();
        streamCleanup = null;
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

      applyDiff: (messageId) => {
        const msg = get().messages.find((m) => m.id === messageId);
        if (!msg?.diff || msg.diff.applied) return;
        const { tabs, updateTabContent } = useEditorStore.getState();
        const tab = tabs.find((t) => t.path === msg.diff!.filePath);
        if (!tab) return;
        const newContent = tab.content.replace(msg.diff.original, msg.diff.modified);
        updateTabContent(tab.id, newContent);
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === messageId && m.diff ? { ...m, diff: { ...m.diff, applied: true } } : m
          ),
        }));
      },

      rejectDiff: (messageId) => {
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === messageId && m.diff ? { ...m, diff: { ...m.diff, applied: false } } : m
          ),
        }));
      },
    }),
    {
      name: 'caval-ai-store-v2',
      partialize: (s) => ({
        selectedModel: s.selectedModel,
        agentMode: s.agentMode,
        includeMode: s.includeMode,
        threads: s.threads,
        activeThreadId: s.activeThreadId,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (state.includeMode === 'file') {
          state.includeMode = 'project';
        }
        const thread = state.threads.find((t) => t.id === state.activeThreadId);
        if (thread) state.messages = thread.messages;
        void loadApiKeysFromSecrets().then((secrets) => {
          if (Object.keys(secrets).length > 0) {
            useAIStore.setState({ apiKeys: secrets });
          }
        });
      },
    }
  )
);

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
