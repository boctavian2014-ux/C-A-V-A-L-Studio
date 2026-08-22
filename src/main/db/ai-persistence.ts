/**
 * Pas 7a.1 — SQLite persistence for AI conversations / messages.
 * Bound to `{workspaceRoot}/.cavalo/ai/history.db`. Main-process only.
 */

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";

import { redactSensitiveCommandOutput } from "../../shared/command-output-redaction";
import {
  sanitizeTimelineEvent,
  type TimelineEvent,
  type TimelineEventInput,
} from "../../shared/ai-timeline-contract";
import { loadAiSettingsSync } from "../ai/ai-settings";

export const AI_PERSIST_MESSAGE_MAX_BYTES = 32 * 1024;
export const AI_PERSIST_SNAPSHOT_MAX_BYTES = 64 * 1024;
export const AI_PERSIST_TRUNCATION_MARKER = "\n…[TRUNCATED]";

export interface Conversation {
  id: string;
  workspaceRoot: string;
  title: string | null;
  /** Pas 7f.1 — last selected model for this conversation (nullable for legacy rows). */
  modelId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  streamId: string | null;
  createdAt: number;
}

export interface WrittenFile {
  filePath: string;
  snapshot: string;
  createdAt?: number;
  id?: string;
  messageId?: string;
}

export interface ConversationSummary {
  id: string;
  title: string | null;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

export interface AiPersistence {
  createConversation(workspaceRoot: string, title?: string, id?: string): string;
  getConversation(id: string): Conversation | null;
  listConversations(workspaceRoot: string): Conversation[];
  listConversationSummaries(
    workspaceRoot: string,
    params?: { limit?: number; offset?: number }
  ): ConversationSummary[];
  updateConversationTitle(id: string, title: string): void;
  /** Pas 7f.1 — set or clear per-conversation model selection. */
  updateConversationModelId(id: string, modelId: string | null): void;
  deleteConversation(id: string): void;

  addMessage(
    conversationId: string,
    role: "user" | "assistant",
    content: string,
    streamId?: string,
    /** When set, reuse this id (UI ↔ DB alignment for feedback / written files). */
    id?: string
  ): string;
  getMessages(conversationId: string): Message[];
  getMessage(id: string): Message | null;
  getMessageByStreamId(streamId: string): Message | null;
  getMessageDetails(messageId: string): {
    timeline: TimelineEvent[];
    writtenFiles: WrittenFile[];
  };

  addTimelineEvents(messageId: string, events: TimelineEvent[]): void;
  getTimelineEvents(messageId: string): TimelineEvent[];

  addWrittenFiles(messageId: string, files: WrittenFile[]): void;
  getWrittenFiles(messageId: string): WrittenFile[];
  getWrittenFile(id: string): WrittenFile | null;

  setFeedback(
    messageId: string,
    rating: "positive" | "negative",
    comment?: string | null
  ): MessageFeedbackRow;
  getFeedback(messageId: string): MessageFeedbackRow | null;
  clearFeedback(messageId: string): void;

  close(): void;
}

export interface MessageFeedbackRow {
  id: string;
  messageId: string;
  rating: "positive" | "negative";
  comment: string | null;
  createdAt: number;
}

export const AI_PERSIST_FEEDBACK_COMMENT_MAX_BYTES = 2 * 1024;

function utf8ByteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

/** Redact + truncate to max UTF-8 bytes, appending a truncation marker when clipped. */
export function gatePersistedText(
  raw: string,
  maxBytes: number,
  redactionLevel: import("../../shared/ai-settings-contract").AiRedactionLevel = "standard"
): string {
  const redacted = redactSensitiveCommandOutput(raw ?? "", redactionLevel);
  if (utf8ByteLength(redacted) <= maxBytes) return redacted;

  const marker = AI_PERSIST_TRUNCATION_MARKER;
  const markerBytes = utf8ByteLength(marker);
  const budget = Math.max(0, maxBytes - markerBytes);
  let end = Math.min(redacted.length, budget);
  while (end > 0 && utf8ByteLength(redacted.slice(0, end)) > budget) {
    end -= 1;
  }
  return `${redacted.slice(0, end)}${marker}`;
}

function normalizeRelPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\.?\//, "").trim().slice(0, 512);
}

function normalizeWorkspaceRoot(root: string): string {
  return path.resolve(root.trim());
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  workspace_root TEXT NOT NULL,
  title TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  stream_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS timeline_events (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  label TEXT NOT NULL,
  detail TEXT,
  tool_name TEXT,
  file_path TEXT,
  success INTEGER
);

CREATE TABLE IF NOT EXISTS written_files (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS message_feedback (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL UNIQUE REFERENCES messages(id) ON DELETE CASCADE,
  rating TEXT NOT NULL CHECK (rating IN ('positive', 'negative')),
  comment TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversations_workspace ON conversations(workspace_root, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_workspace_updated ON conversations(workspace_root, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_timeline_message ON timeline_events(message_id);
CREATE INDEX IF NOT EXISTS idx_written_message ON written_files(message_id);
CREATE INDEX IF NOT EXISTS idx_feedback_message ON message_feedback(message_id);
`;

/** Additive migrations for existing DBs (never destructive). */
function migrateAiSchema(db: InstanceType<typeof Database>): void {
  const cols = db.prepare(`PRAGMA table_info(conversations)`).all() as Array<{ name: string }>;
  const names = new Set(cols.map((c) => c.name));
  if (!names.has("model_id")) {
    db.exec(`ALTER TABLE conversations ADD COLUMN model_id TEXT`);
  }
}

export function aiHistoryDbPath(workspaceRoot: string): string {
  return path.join(normalizeWorkspaceRoot(workspaceRoot), ".cavalo", "ai", "history.db");
}

export function createAiPersistence(workspaceRoot: string): AiPersistence {
  const boundRoot = normalizeWorkspaceRoot(workspaceRoot);
  if (!boundRoot) {
    throw new Error("workspaceRoot is required");
  }

  const dbPath = aiHistoryDbPath(boundRoot);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  migrateAiSchema(db);

  function persistPolicy() {
    const settings = loadAiSettingsSync(boundRoot);
    return {
      messageBytes: Math.max(8 * 1024, settings.messageCapKB * 1024),
      snapshotBytes: Math.max(16 * 1024, settings.snapshotCapKB * 1024),
      redactionLevel: settings.redactionLevel,
    };
  }

  const touchConversation = db.prepare(
    `UPDATE conversations SET updated_at = ? WHERE id = ?`
  );

  const insertConversation = db.prepare(`
    INSERT INTO conversations (id, workspace_root, title, created_at, updated_at)
    VALUES (@id, @workspace_root, @title, @created_at, @updated_at)
  `);

  const selectConversation = db.prepare(`
    SELECT id, workspace_root AS workspaceRoot, title,
           model_id AS modelId,
           created_at AS createdAt, updated_at AS updatedAt
    FROM conversations WHERE id = ?
  `);

  const listByWorkspace = db.prepare(`
    SELECT id, workspace_root AS workspaceRoot, title,
           model_id AS modelId,
           created_at AS createdAt, updated_at AS updatedAt
    FROM conversations
    WHERE workspace_root = ?
    ORDER BY updated_at DESC
  `);

  const listSummariesByWorkspacePage = db.prepare(`
    SELECT c.id AS id,
           c.title AS title,
           c.created_at AS createdAt,
           c.updated_at AS updatedAt,
           (
             SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id
           ) AS messageCount
    FROM conversations c
    WHERE c.workspace_root = ?
    ORDER BY c.updated_at DESC
    LIMIT ? OFFSET ?
  `);

  const updateTitle = db.prepare(`
    UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?
  `);

  const updateModelId = db.prepare(`
    UPDATE conversations SET model_id = ?, updated_at = ? WHERE id = ?
  `);

  const deleteConversationStmt = db.prepare(`DELETE FROM conversations WHERE id = ?`);

  const insertMessage = db.prepare(`
    INSERT INTO messages (id, conversation_id, role, content, stream_id, created_at)
    VALUES (@id, @conversation_id, @role, @content, @stream_id, @created_at)
  `);

  const selectMessages = db.prepare(`
    SELECT id, conversation_id AS conversationId, role, content,
           stream_id AS streamId, created_at AS createdAt
    FROM messages
    WHERE conversation_id = ?
    ORDER BY created_at ASC, rowid ASC
  `);

  const selectMessageById = db.prepare(`
    SELECT id, conversation_id AS conversationId, role, content,
           stream_id AS streamId, created_at AS createdAt
    FROM messages
    WHERE id = ?
  `);

  const selectMessageByStreamId = db.prepare(`
    SELECT id, conversation_id AS conversationId, role, content,
           stream_id AS streamId, created_at AS createdAt
    FROM messages
    WHERE stream_id = ?
    ORDER BY created_at DESC, rowid DESC
    LIMIT 1
  `);

  const messageExists = db.prepare(`SELECT 1 AS ok FROM messages WHERE id = ?`);

  const upsertFeedback = db.prepare(`
    INSERT INTO message_feedback (id, message_id, rating, comment, created_at)
    VALUES (@id, @message_id, @rating, @comment, @created_at)
    ON CONFLICT(message_id) DO UPDATE SET
      id = excluded.id,
      rating = excluded.rating,
      comment = excluded.comment,
      created_at = excluded.created_at
  `);

  const selectFeedback = db.prepare(`
    SELECT id, message_id AS messageId, rating, comment, created_at AS createdAt
    FROM message_feedback
    WHERE message_id = ?
  `);

  const deleteFeedback = db.prepare(`DELETE FROM message_feedback WHERE message_id = ?`);

  const insertTimeline = db.prepare(`
    INSERT INTO timeline_events
      (id, message_id, type, timestamp, label, detail, tool_name, file_path, success)
    VALUES
      (@id, @message_id, @type, @timestamp, @label, @detail, @tool_name, @file_path, @success)
  `);

  const selectTimeline = db.prepare(`
    SELECT id, type, timestamp, label, detail,
           tool_name AS toolName, file_path AS filePath, success
    FROM timeline_events
    WHERE message_id = ?
    ORDER BY timestamp ASC, rowid ASC
  `);

  const insertWritten = db.prepare(`
    INSERT INTO written_files (id, message_id, file_path, snapshot, created_at)
    VALUES (@id, @message_id, @file_path, @snapshot, @created_at)
  `);

  const selectWritten = db.prepare(`
    SELECT id, message_id AS messageId, file_path AS filePath, snapshot, created_at AS createdAt
    FROM written_files
    WHERE message_id = ?
    ORDER BY created_at ASC, rowid ASC
  `);

  const selectWrittenById = db.prepare(`
    SELECT id, message_id AS messageId, file_path AS filePath, snapshot, created_at AS createdAt
    FROM written_files
    WHERE id = ?
  `);

  function mapConversation(row: Record<string, unknown> | undefined): Conversation | null {
    if (!row) return null;
    return {
      id: String(row.id),
      workspaceRoot: String(row.workspaceRoot),
      title: row.title == null ? null : String(row.title),
      modelId:
        row.modelId == null || row.modelId === ""
          ? null
          : String(row.modelId).slice(0, 256),
      createdAt: Number(row.createdAt),
      updatedAt: Number(row.updatedAt),
    };
  }

  const api: AiPersistence = {
    createConversation(root: string, title?: string, id?: string): string {
      const ws = normalizeWorkspaceRoot(root);
      const requested = id?.trim();
      if (requested) {
        const existing = mapConversation(
          selectConversation.get(requested) as Record<string, unknown> | undefined
        );
        if (existing) {
          if (normalizeWorkspaceRoot(existing.workspaceRoot) !== ws) {
            throw new Error("Conversation workspace mismatch");
          }
          return existing.id;
        }
      }
      const convId = requested || randomUUID();
      const now = Date.now();
      const policy = persistPolicy();
      const safeTitle =
        typeof title === "string" && title.trim()
          ? gatePersistedText(title.trim(), 500, policy.redactionLevel)
          : null;
      insertConversation.run({
        id: convId,
        workspace_root: ws,
        title: safeTitle,
        created_at: now,
        updated_at: now,
      });
      return convId;
    },

    getConversation(id: string): Conversation | null {
      return mapConversation(selectConversation.get(id) as Record<string, unknown> | undefined);
    },

    listConversations(root: string): Conversation[] {
      const ws = normalizeWorkspaceRoot(root);
      const rows = listByWorkspace.all(ws) as Array<Record<string, unknown>>;
      return rows.map((r) => mapConversation(r)!).filter(Boolean);
    },

    listConversationSummaries(
      root: string,
      params?: { limit?: number; offset?: number }
    ): ConversationSummary[] {
      const ws = normalizeWorkspaceRoot(root);
      const limitRaw = params?.limit;
      const offsetRaw = params?.offset ?? 0;
      const limit =
        typeof limitRaw === "number" && Number.isFinite(limitRaw)
          ? Math.max(1, Math.min(100, Math.floor(limitRaw)))
          : 50;
      const offset =
        typeof offsetRaw === "number" && Number.isFinite(offsetRaw)
          ? Math.max(0, Math.floor(offsetRaw))
          : 0;
      const rows = listSummariesByWorkspacePage.all(ws, limit, offset) as Array<
        Record<string, unknown>
      >;
      return rows.map((r) => ({
        id: String(r.id),
        title: r.title == null ? null : String(r.title),
        createdAt: Number(r.createdAt),
        updatedAt: Number(r.updatedAt),
        messageCount: Number(r.messageCount) || 0,
      }));
    },

    updateConversationTitle(id: string, title: string): void {
      const policy = persistPolicy();
      const safe = gatePersistedText(title.trim(), 500, policy.redactionLevel);
      updateTitle.run(safe, Date.now(), id);
    },

    updateConversationModelId(id: string, modelId: string | null): void {
      const trimmed = modelId?.trim() || null;
      const safe =
        trimmed && trimmed.length > 0 ? trimmed.slice(0, 256) : null;
      updateModelId.run(safe, Date.now(), id);
    },

    deleteConversation(id: string): void {
      deleteConversationStmt.run(id);
    },

    addMessage(
      conversationId: string,
      role: "user" | "assistant",
      content: string,
      streamId?: string,
      id?: string
    ): string {
      if (role !== "user" && role !== "assistant") {
        throw new Error("Invalid message role");
      }
      const conv = api.getConversation(conversationId);
      if (!conv) throw new Error("Conversation not found");

      const requested = id?.trim();
      const finalId =
        requested && !api.getMessage(requested) ? requested : randomUUID();
      const now = Date.now();
      const policy = persistPolicy();
      const gated = gatePersistedText(
        content,
        policy.messageBytes || AI_PERSIST_MESSAGE_MAX_BYTES,
        policy.redactionLevel
      );
      insertMessage.run({
        id: finalId,
        conversation_id: conversationId,
        role,
        content: gated,
        stream_id: streamId?.trim() || null,
        created_at: now,
      });
      touchConversation.run(now, conversationId);
      return finalId;
    },

    getMessages(conversationId: string): Message[] {
      const rows = selectMessages.all(conversationId) as Array<Record<string, unknown>>;
      return rows.map((r) => ({
        id: String(r.id),
        conversationId: String(r.conversationId),
        role: r.role as "user" | "assistant",
        content: String(r.content),
        streamId: r.streamId == null ? null : String(r.streamId),
        createdAt: Number(r.createdAt),
      }));
    },

    getMessage(id: string): Message | null {
      const r = selectMessageById.get(id) as Record<string, unknown> | undefined;
      if (!r) return null;
      return {
        id: String(r.id),
        conversationId: String(r.conversationId),
        role: r.role as "user" | "assistant",
        content: String(r.content),
        streamId: r.streamId == null ? null : String(r.streamId),
        createdAt: Number(r.createdAt),
      };
    },

    getMessageByStreamId(streamId: string): Message | null {
      const sid = streamId.trim();
      if (!sid) return null;
      const r = selectMessageByStreamId.get(sid) as Record<string, unknown> | undefined;
      if (!r) return null;
      return {
        id: String(r.id),
        conversationId: String(r.conversationId),
        role: r.role as "user" | "assistant",
        content: String(r.content),
        streamId: r.streamId == null ? null : String(r.streamId),
        createdAt: Number(r.createdAt),
      };
    },

    getMessageDetails(messageId: string): {
      timeline: TimelineEvent[];
      writtenFiles: WrittenFile[];
    } {
      return {
        timeline: api.getTimelineEvents(messageId),
        writtenFiles: api.getWrittenFiles(messageId),
      };
    },

    addTimelineEvents(messageId: string, events: TimelineEvent[]): void {
      if (!messageExists.get(messageId)) {
        throw new Error("Message not found");
      }
      const policy = persistPolicy();
      const insertMany = db.transaction((list: TimelineEvent[]) => {
        for (const raw of list) {
          const sanitized = sanitizeTimelineEvent(raw as TimelineEventInput);
          const detail =
            typeof sanitized.detail === "string"
              ? gatePersistedText(
                  sanitized.detail,
                  policy.messageBytes || AI_PERSIST_MESSAGE_MAX_BYTES,
                  policy.redactionLevel
                )
              : null;
          insertTimeline.run({
            id: sanitized.id,
            message_id: messageId,
            type: sanitized.type,
            timestamp: sanitized.timestamp,
            label: gatePersistedText(sanitized.label, 500, policy.redactionLevel),
            detail,
            tool_name: sanitized.toolName ?? null,
            file_path: sanitized.filePath ? normalizeRelPath(sanitized.filePath) : null,
            success:
              typeof sanitized.success === "boolean" ? (sanitized.success ? 1 : 0) : null,
          });
        }
      });
      insertMany(events ?? []);
    },

    getTimelineEvents(messageId: string): TimelineEvent[] {
      const rows = selectTimeline.all(messageId) as Array<Record<string, unknown>>;
      return rows.map((r) => ({
        id: String(r.id),
        type: r.type as TimelineEvent["type"],
        timestamp: Number(r.timestamp),
        label: String(r.label),
        ...(r.detail != null ? { detail: String(r.detail) } : {}),
        ...(r.toolName != null ? { toolName: String(r.toolName) } : {}),
        ...(r.filePath != null ? { filePath: String(r.filePath) } : {}),
        ...(r.success === 0 || r.success === 1 ? { success: r.success === 1 } : {}),
      }));
    },

    addWrittenFiles(messageId: string, files: WrittenFile[]): void {
      if (!messageExists.get(messageId)) {
        throw new Error("Message not found");
      }
      const policy = persistPolicy();
      const insertMany = db.transaction((list: WrittenFile[]) => {
        for (const file of list) {
          const filePath = normalizeRelPath(file.filePath);
          if (!filePath || filePath.includes("..")) continue;
          const snapshot = gatePersistedText(
            file.snapshot ?? "",
            policy.snapshotBytes || AI_PERSIST_SNAPSHOT_MAX_BYTES,
            policy.redactionLevel
          );
          insertWritten.run({
            id: file.id?.trim() || randomUUID(),
            message_id: messageId,
            file_path: filePath,
            snapshot,
            created_at: file.createdAt ?? Date.now(),
          });
        }
      });
      insertMany(files ?? []);
    },

    getWrittenFiles(messageId: string): WrittenFile[] {
      const rows = selectWritten.all(messageId) as Array<Record<string, unknown>>;
      return rows.map((r) => ({
        id: String(r.id),
        messageId: String(r.messageId),
        filePath: String(r.filePath),
        snapshot: String(r.snapshot),
        createdAt: Number(r.createdAt),
      }));
    },

    getWrittenFile(id: string): WrittenFile | null {
      const row = selectWrittenById.get(id) as Record<string, unknown> | undefined;
      if (!row) return null;
      return {
        id: String(row.id),
        messageId: String(row.messageId),
        filePath: String(row.filePath),
        snapshot: String(row.snapshot),
        createdAt: Number(row.createdAt),
      };
    },

    setFeedback(
      messageId: string,
      rating: "positive" | "negative",
      comment?: string | null
    ): MessageFeedbackRow {
      if (rating !== "positive" && rating !== "negative") {
        throw new Error("Invalid feedback rating");
      }
      if (!messageExists.get(messageId)) {
        throw new Error("Message not found");
      }
      const now = Date.now();
      const feedbackId = randomUUID();
      const policy = persistPolicy();
      const gatedComment =
        comment == null || !String(comment).trim()
          ? null
          : gatePersistedText(
              String(comment).trim(),
              AI_PERSIST_FEEDBACK_COMMENT_MAX_BYTES,
              policy.redactionLevel
            );
      upsertFeedback.run({
        id: feedbackId,
        message_id: messageId,
        rating,
        comment: gatedComment,
        created_at: now,
      });
      const row = api.getFeedback(messageId);
      if (!row) throw new Error("Failed to persist feedback");
      return row;
    },

    getFeedback(messageId: string): MessageFeedbackRow | null {
      const row = selectFeedback.get(messageId) as Record<string, unknown> | undefined;
      if (!row) return null;
      return {
        id: String(row.id),
        messageId: String(row.messageId),
        rating: row.rating as "positive" | "negative",
        comment: row.comment == null ? null : String(row.comment),
        createdAt: Number(row.createdAt),
      };
    },

    clearFeedback(messageId: string): void {
      deleteFeedback.run(messageId);
    },

    close(): void {
      db.close();
    },
  };

  return api;
}
