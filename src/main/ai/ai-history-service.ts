/**
 * Pas 7a.4 — history load / delete / historical revert (main, bound workspace).
 */

import fs from "node:fs";
import path from "node:path";

import type { AiPersistence } from "../db/ai-persistence";
import { getAiPersistence } from "./timeline-persistence";
import {
  formatHistoryTitle,
  normalizeListConversationsParams,
  type AiHistoryConversationPayload,
  type ConversationSummary,
  type HistoryWrittenFile,
  type MessageFeedback,
} from "../../shared/ai-history-contract";
import type { TimelineEvent } from "../../shared/ai-timeline-contract";
import { normalizeProposedPath } from "../../shared/ai-chat-apply-contract";

function joinWorkspace(root: string, rel: string): string {
  const sep = root.includes("\\") ? "\\" : "/";
  const clean = rel.replace(/[/\\]+/g, sep).replace(new RegExp(`^\\${sep}+`), "");
  return `${root.replace(/[/\\]+$/, "")}${sep}${clean}`;
}

export function listHistoryConversations(
  workspaceRoot: string,
  persistence?: AiPersistence,
  params?: import("../../shared/ai-history-contract").ListConversationsParams
): ConversationSummary[] {
  const root = workspaceRoot.trim();
  if (!root) return [];
  const db = persistence ?? getAiPersistence(root);
  const { limit, offset } = normalizeListConversationsParams(params);
  return db.listConversationSummaries(root, { limit, offset }).map((c) => ({
    id: c.id,
    title: formatHistoryTitle(c.title),
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    messageCount: c.messageCount,
  }));
}

export function loadHistoryConversation(
  workspaceRoot: string,
  conversationId: string,
  persistence?: AiPersistence
): AiHistoryConversationPayload | null {
  const root = workspaceRoot.trim();
  const id = conversationId.trim();
  if (!root || !id) return null;
  const db = persistence ?? getAiPersistence(root);
  const conv = db.getConversation(id);
  if (!conv) return null;
  if (path.resolve(conv.workspaceRoot) !== path.resolve(root)) {
    return null;
  }

  const messages = db.getMessages(id).map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    streamId: m.streamId,
    createdAt: m.createdAt,
  }));

  const timelineByMessage: AiHistoryConversationPayload["timelineByMessage"] = {};
  const writtenFilesByMessage: AiHistoryConversationPayload["writtenFilesByMessage"] = {};

  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    const timeline = db.getTimelineEvents(msg.id);
    if (timeline.length) timelineByMessage[msg.id] = timeline;
    const written = db.getWrittenFiles(msg.id).map(
      (f): HistoryWrittenFile => ({
        id: f.id!,
        messageId: f.messageId ?? msg.id,
        filePath: f.filePath,
        createdAt: f.createdAt ?? 0,
        // Snapshots stay in DB; revert uses id via main.
      })
    );
    if (written.length) writtenFilesByMessage[msg.id] = written;
  }

  return {
    messages,
    timelineByMessage,
    writtenFilesByMessage,
    modelId: conv.modelId ?? null,
  };
}

/** Pas 7e.4 — lazy details for a single message (timeline + written files paths). */
export function loadHistoryMessageDetails(
  workspaceRoot: string,
  messageId: string,
  persistence?: AiPersistence
): { timeline: TimelineEvent[]; writtenFiles: HistoryWrittenFile[] } | null {
  const root = workspaceRoot.trim();
  const id = messageId.trim();
  if (!root || !id) return null;
  const db = persistence ?? getAiPersistence(root);
  const msg = db.getMessage(id);
  if (!msg) return null;
  const conv = db.getConversation(msg.conversationId);
  if (!conv || path.resolve(conv.workspaceRoot) !== path.resolve(root)) return null;
  const details = db.getMessageDetails(id);
  return {
    timeline: details.timeline,
    writtenFiles: details.writtenFiles.map((f) => ({
      id: f.id!,
      messageId: f.messageId ?? id,
      filePath: f.filePath,
      createdAt: f.createdAt ?? 0,
    })),
  };
}

export function deleteHistoryConversation(
  workspaceRoot: string,
  conversationId: string,
  persistence?: AiPersistence
): { ok: boolean; error?: string } {
  const root = workspaceRoot.trim();
  const id = conversationId.trim();
  if (!root || !id) return { ok: false, error: "Missing workspace or conversation" };
  const db = persistence ?? getAiPersistence(root);
  const conv = db.getConversation(id);
  if (!conv) return { ok: false, error: "Conversation not found" };
  if (path.resolve(conv.workspaceRoot) !== path.resolve(root)) {
    return { ok: false, error: "Cross-workspace delete denied" };
  }
  db.deleteConversation(id);
  return { ok: true };
}

export function revertHistoryWrittenFile(
  workspaceRoot: string,
  writtenFileId: string,
  persistence?: AiPersistence
): { ok: boolean; error?: string; filePath?: string } {
  const root = workspaceRoot.trim();
  const id = writtenFileId.trim();
  if (!root || !id) return { ok: false, error: "Missing workspace or file id" };
  const db = persistence ?? getAiPersistence(root);
  const file = db.getWrittenFile(id);
  if (!file) return { ok: false, error: "Written file not found" };

  const rel = normalizeProposedPath(file.filePath);
  if (!rel || rel.includes("..")) {
    return { ok: false, error: "Invalid file path" };
  }

  // Ensure the row belongs to a conversation in this workspace.
  const messageId = file.messageId;
  if (messageId) {
    const msg = db.getMessage(messageId);
    if (!msg) return { ok: false, error: "Message not found" };
    const conv = db.getConversation(msg.conversationId);
    if (!conv || path.resolve(conv.workspaceRoot) !== path.resolve(root)) {
      return { ok: false, error: "Cross-workspace revert denied" };
    }
  }

  const abs = joinWorkspace(root, rel);
  try {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, file.snapshot ?? "", "utf8");
    return { ok: true, filePath: rel };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to write snapshot",
    };
  }
}

function resolveFeedbackMessageId(
  workspaceRoot: string,
  messageId: string,
  streamId: string | undefined,
  db: AiPersistence
): string | null {
  const root = workspaceRoot.trim();
  const mid = messageId.trim();
  if (!root || !mid) return null;

  const byId = db.getMessage(mid);
  if (byId) {
    const conv = db.getConversation(byId.conversationId);
    if (!conv || path.resolve(conv.workspaceRoot) !== path.resolve(root)) return null;
    if (byId.role !== "assistant") return null;
    return byId.id;
  }

  const sid = streamId?.trim();
  if (!sid) return null;
  const byStream = db.getMessageByStreamId(sid);
  if (!byStream || byStream.role !== "assistant") return null;
  const conv = db.getConversation(byStream.conversationId);
  if (!conv || path.resolve(conv.workspaceRoot) !== path.resolve(root)) return null;
  return byStream.id;
}

export function setHistoryFeedback(
  workspaceRoot: string,
  messageId: string,
  rating: "positive" | "negative",
  comment?: string | null,
  streamId?: string,
  persistence?: AiPersistence
): { ok: boolean; feedback?: MessageFeedback; error?: string } {
  const root = workspaceRoot.trim();
  if (!root) return { ok: false, error: "Missing workspace" };
  if (rating !== "positive" && rating !== "negative") {
    return { ok: false, error: "Invalid rating" };
  }
  const db = persistence ?? getAiPersistence(root);
  const resolved = resolveFeedbackMessageId(root, messageId, streamId, db);
  if (!resolved) return { ok: false, error: "Message not found" };
  try {
    const row = db.setFeedback(resolved, rating, comment);
    return {
      ok: true,
      feedback: {
        id: row.id,
        messageId: row.messageId,
        rating: row.rating,
        comment: row.comment ?? undefined,
        createdAt: row.createdAt,
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to set feedback" };
  }
}

export function getHistoryFeedback(
  workspaceRoot: string,
  messageId: string,
  streamId?: string,
  persistence?: AiPersistence
): { ok: boolean; feedback?: MessageFeedback | null; error?: string } {
  const root = workspaceRoot.trim();
  if (!root) return { ok: false, error: "Missing workspace" };
  const db = persistence ?? getAiPersistence(root);
  const resolved = resolveFeedbackMessageId(root, messageId, streamId, db);
  if (!resolved) return { ok: true, feedback: null };
  const row = db.getFeedback(resolved);
  return {
    ok: true,
    feedback: row
      ? {
          id: row.id,
          messageId: row.messageId,
          rating: row.rating,
          comment: row.comment ?? undefined,
          createdAt: row.createdAt,
        }
      : null,
  };
}

export function clearHistoryFeedback(
  workspaceRoot: string,
  messageId: string,
  streamId?: string,
  persistence?: AiPersistence
): { ok: boolean; error?: string } {
  const root = workspaceRoot.trim();
  if (!root) return { ok: false, error: "Missing workspace" };
  const db = persistence ?? getAiPersistence(root);
  const resolved = resolveFeedbackMessageId(root, messageId, streamId, db);
  if (!resolved) return { ok: false, error: "Message not found" };
  db.clearFeedback(resolved);
  return { ok: true };
}
