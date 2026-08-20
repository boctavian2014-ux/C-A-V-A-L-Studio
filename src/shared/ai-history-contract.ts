/**
 * Pas 7a.4 — conversation history restore contract (renderer ↔ main).
 */

import type { TimelineEvent } from "./ai-timeline-contract";

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

/** Pas 7e.4 — paginated history list. */
export interface ListConversationsParams {
  limit?: number;
  offset?: number;
}

export const HISTORY_LIST_PAGE_SIZE = 30;
export const HISTORY_LIST_MAX_PAGE_SIZE = 100;

export function normalizeListConversationsParams(
  params?: ListConversationsParams
): { limit: number; offset: number } {
  const rawLimit = params?.limit ?? HISTORY_LIST_PAGE_SIZE;
  const rawOffset = params?.offset ?? 0;
  const limit = Math.max(
    1,
    Math.min(
      HISTORY_LIST_MAX_PAGE_SIZE,
      Number.isFinite(rawLimit) ? Math.floor(rawLimit) : HISTORY_LIST_PAGE_SIZE
    )
  );
  const offset = Math.max(
    0,
    Number.isFinite(rawOffset) ? Math.floor(rawOffset) : 0
  );
  return { limit, offset };
}

export interface HistoryMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  streamId: string | null;
  createdAt: number;
}

export interface HistoryWrittenFile {
  id: string;
  messageId: string;
  filePath: string;
  /** Snapshot is omitted from list payloads when not needed; present for local restore maps. */
  snapshot?: string;
  createdAt: number;
}

export interface AiHistoryConversationPayload {
  messages: HistoryMessage[];
  timelineByMessage: Record<string, TimelineEvent[]>;
  writtenFilesByMessage: Record<string, HistoryWrittenFile[]>;
}

export type ExportFormat = "json" | "markdown";

export interface ExportRequest {
  conversationId: string;
  format: ExportFormat;
  /** Required to receive content when export exceeds HISTORY_EXPORT_WARN_BYTES. */
  acknowledgeLarge?: boolean;
}

export interface ExportResult {
  success: boolean;
  content?: string;
  suggestedFilename?: string;
  error?: string;
  /** True when export would exceed HISTORY_EXPORT_WARN_BYTES without acknowledgeLarge. */
  sizeWarning?: boolean;
  byteLength?: number;
}

/** Soft cap: warn before generating/returning oversized exports (paths only; no file snapshots). */
export const HISTORY_EXPORT_WARN_BYTES = 5 * 1024 * 1024;

export interface AiHistoryApi {
  listConversations(params?: ListConversationsParams): Promise<ConversationSummary[]>;
  getConversation(id: string): Promise<AiHistoryConversationPayload | null>;
  getMessageDetails?(
    messageId: string
  ): Promise<{ timeline: TimelineEvent[]; writtenFiles: HistoryWrittenFile[] } | null>;
  deleteConversation(id: string): Promise<{ ok: boolean; error?: string }>;
  revertWrittenFile(writtenFileId: string): Promise<{ ok: boolean; error?: string }>;
  exportConversation(req: ExportRequest): Promise<ExportResult>;
  setFeedback(
    messageId: string,
    rating: "positive" | "negative",
    comment?: string,
    streamId?: string
  ): Promise<{ ok: boolean; feedback?: MessageFeedback; error?: string }>;
  getFeedback(
    messageId: string,
    streamId?: string
  ): Promise<{ ok: boolean; feedback?: MessageFeedback | null; error?: string }>;
  clearFeedback(
    messageId: string,
    streamId?: string
  ): Promise<{ ok: boolean; error?: string }>;
}

export interface MessageFeedback {
  id: string;
  messageId: string;
  rating: "positive" | "negative";
  comment?: string;
  createdAt: number;
}

export function formatHistoryTitle(title: string | null | undefined, fallback = "Chat"): string {
  const t = title?.trim();
  return t || fallback;
}

export function formatHistoryWhen(ts: number, now = Date.now()): string {
  const dayMs = 24 * 60 * 60 * 1000;
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const start = startToday.getTime();
  if (ts >= start) return "Today";
  if (ts >= start - dayMs) return "Yesterday";
  return new Date(ts).toLocaleDateString();
}
