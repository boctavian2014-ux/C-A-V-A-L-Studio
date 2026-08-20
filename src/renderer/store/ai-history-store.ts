import { create } from "zustand";

import type {
  AiHistoryConversationPayload,
  ConversationSummary,
  ExportFormat,
  HistoryWrittenFile,
} from "../../shared/ai-history-contract";
import type { ChatMessage } from "../../../ai/composer/ai-store";
import { useAIStore } from "../../../ai/composer/ai-store";
import { useEditorStore } from "./editor-store";

interface AiHistoryStore {
  conversations: ConversationSummary[];
  loading: boolean;
  activeHistoryId: string | null;
  error: string | null;
  exportBusy: boolean;
  refresh: () => Promise<void>;
  openConversation: (id: string) => Promise<boolean>;
  deleteConversation: (id: string) => Promise<boolean>;
  revertWrittenFile: (writtenFileId: string) => Promise<boolean>;
  exportConversation: (conversationId: string, format: ExportFormat) => Promise<boolean>;
}

export function historyPayloadToChatMessages(
  payload: AiHistoryConversationPayload
): ChatMessage[] {
  return payload.messages.map((m) => {
    const timeline = payload.timelineByMessage[m.id];
    const written = payload.writtenFilesByMessage[m.id] ?? [];
    return {
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.createdAt,
      ...(m.streamId ? { streamId: m.streamId } : {}),
      ...(timeline?.length ? { timelineEvents: timeline, timelineExpanded: true } : {}),
      ...(written.length
        ? {
            writtenFiles: written.map((f) => f.filePath),
            historicalWrittenFiles: written.map((f) => ({
              id: f.id,
              filePath: f.filePath,
              messageId: f.messageId,
              createdAt: f.createdAt,
            })),
          }
        : {}),
    };
  });
}

export const useAiHistoryStore = create<AiHistoryStore>((set, get) => ({
  conversations: [],
  loading: false,
  activeHistoryId: null,
  error: null,
  exportBusy: false,

  refresh: async () => {
    const projectPath = useEditorStore.getState().projectPath;
    if (!projectPath || !window.caval?.aiHistory?.listConversations) {
      set({ conversations: [], activeHistoryId: null, error: null });
      return;
    }
    set({ loading: true, error: null });
    try {
      const res = await window.caval.aiHistory.listConversations();
      if (!res.ok) {
        set({ loading: false, error: res.error ?? "Failed to list history", conversations: [] });
        return;
      }
      set({
        loading: false,
        conversations: res.conversations ?? [],
        error: null,
      });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : "Failed to list history",
        conversations: [],
      });
    }
  },

  openConversation: async (id: string) => {
    const api = window.caval?.aiHistory;
    if (!api?.getConversation) return false;
    set({ loading: true, error: null });
    try {
      const res = await api.getConversation(id);
      if (!res.ok || !res.conversation) {
        set({ loading: false, error: res.error ?? "Conversation not found" });
        return false;
      }
      const messages = historyPayloadToChatMessages(res.conversation);
      const title =
        get().conversations.find((c) => c.id === id)?.title ?? "Chat";
      useAIStore.setState((s) => {
        const existing = s.threads.find((t) => t.id === id);
        const threads = existing
          ? s.threads.map((t) =>
              t.id === id
                ? { ...t, messages, title, updatedAt: Date.now(), archived: false }
                : t
            )
          : [
              {
                id,
                title,
                messages,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                workspacePath: useEditorStore.getState().projectPath,
                archived: false,
              },
              ...s.threads,
            ];
        return {
          threads,
          activeThreadId: id,
          messages,
        };
      });
      set({ loading: false, activeHistoryId: id, error: null });
      return true;
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : "Failed to open conversation",
      });
      return false;
    }
  },

  deleteConversation: async (id: string) => {
    const api = window.caval?.aiHistory;
    if (!api?.deleteConversation) return false;
    const confirmed =
      typeof window.confirm === "function"
        ? window.confirm("Delete this conversation and its timeline history?")
        : true;
    if (!confirmed) return false;
    const res = await api.deleteConversation(id);
    if (!res.ok) {
      set({ error: res.error ?? "Delete failed" });
      return false;
    }
    set((s) => ({
      conversations: s.conversations.filter((c) => c.id !== id),
      activeHistoryId: s.activeHistoryId === id ? null : s.activeHistoryId,
    }));
    if (useAIStore.getState().activeThreadId === id) {
      useAIStore.getState().newThread();
    }
    return true;
  },

  revertWrittenFile: async (writtenFileId: string) => {
    const api = window.caval?.aiHistory;
    if (!api?.revertWrittenFile) return false;
    const confirmed =
      typeof window.confirm === "function"
        ? window.confirm("Restore this file to the accepted snapshot?")
        : true;
    if (!confirmed) return false;
    const res = await api.revertWrittenFile(writtenFileId);
    if (!res.ok) {
      set({ error: res.error ?? "Revert failed" });
      return false;
    }
    await useEditorStore.getState().refreshTree();
    return true;
  },

  exportConversation: async (conversationId: string, format: ExportFormat) => {
    const api = window.caval?.aiHistory;
    if (!api?.exportConversation) {
      set({ error: "Export unavailable — restart CAVAL Studio after rebuild" });
      return false;
    }
    set({ exportBusy: true, error: null });
    try {
      let result = await api.exportConversation({ conversationId, format });
      if (!result.success && result.sizeWarning) {
        const ok =
          typeof window.confirm === "function"
            ? window.confirm(
                `Export is large (${Math.ceil((result.byteLength ?? 0) / (1024 * 1024))} MB). Continue?`
              )
            : true;
        if (!ok) {
          set({ exportBusy: false });
          return false;
        }
        result = await api.exportConversation({
          conversationId,
          format,
          acknowledgeLarge: true,
        });
      }
      if (!result.success || !result.content) {
        set({ exportBusy: false, error: result.error ?? "Export failed" });
        return false;
      }

      const save = window.caval?.saveFile;
      if (!save) {
        set({ exportBusy: false, error: "Save dialog unavailable" });
        return false;
      }
      const saved = await save({
        content: result.content,
        saveAs: true,
        path: result.suggestedFilename,
      });
      set({ exportBusy: false });
      if (saved.canceled) return false;
      return true;
    } catch (err) {
      set({
        exportBusy: false,
        error: err instanceof Error ? err.message : "Export failed",
      });
      return false;
    }
  },
}));

export type { HistoryWrittenFile };
