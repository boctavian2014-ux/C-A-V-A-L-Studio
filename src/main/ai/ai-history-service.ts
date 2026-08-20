/**
 * Pas 7a.4 — history load / delete / historical revert (main, bound workspace).
 */

import fs from "node:fs";
import path from "node:path";

import type { AiPersistence } from "../db/ai-persistence";
import { getAiPersistence } from "./timeline-persistence";
import {
  formatHistoryTitle,
  type AiHistoryConversationPayload,
  type ConversationSummary,
  type HistoryWrittenFile,
} from "../../shared/ai-history-contract";
import { normalizeProposedPath } from "../../shared/ai-chat-apply-contract";

function joinWorkspace(root: string, rel: string): string {
  const sep = root.includes("\\") ? "\\" : "/";
  const clean = rel.replace(/[/\\]+/g, sep).replace(new RegExp(`^\\${sep}+`), "");
  return `${root.replace(/[/\\]+$/, "")}${sep}${clean}`;
}

export function listHistoryConversations(
  workspaceRoot: string,
  persistence?: AiPersistence
): ConversationSummary[] {
  const root = workspaceRoot.trim();
  if (!root) return [];
  const db = persistence ?? getAiPersistence(root);
  return db.listConversationSummaries(root).map((c) => ({
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

  return { messages, timelineByMessage, writtenFilesByMessage };
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
