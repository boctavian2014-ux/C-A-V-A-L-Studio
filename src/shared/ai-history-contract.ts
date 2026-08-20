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

export interface AiHistoryApi {
  listConversations(): Promise<ConversationSummary[]>;
  getConversation(id: string): Promise<AiHistoryConversationPayload | null>;
  deleteConversation(id: string): Promise<{ ok: boolean; error?: string }>;
  revertWrittenFile(writtenFileId: string): Promise<{ ok: boolean; error?: string }>;
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
