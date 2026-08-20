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

export const AI_PERSIST_MESSAGE_MAX_BYTES = 32 * 1024;
export const AI_PERSIST_SNAPSHOT_MAX_BYTES = 64 * 1024;
export const AI_PERSIST_TRUNCATION_MARKER = "\n…[TRUNCATED]";

export interface Conversation {
  id: string;
  workspaceRoot: string;
  title: string | null;
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
}

export interface AiPersistence {
  createConversation(workspaceRoot: string, title?: string): string;
  getConversation(id: string): Conversation | null;
  listConversations(workspaceRoot: string): Conversation[];
  updateConversationTitle(id: string, title: string): void;
  deleteConversation(id: string): void;

  addMessage(
    conversationId: string,
    role: "user" | "assistant",
    content: string,
    streamId?: string
  ): string;
  getMessages(conversationId: string): Message[];

  addTimelineEvents(messageId: string, events: TimelineEvent[]): void;
  getTimelineEvents(messageId: string): TimelineEvent[];

  addWrittenFiles(messageId: string, files: WrittenFile[]): void;
  getWrittenFiles(messageId: string): WrittenFile[];

  close(): void;
}

function utf8ByteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

/** Redact + truncate to max UTF-8 bytes, appending a truncation marker when clipped. */
export function gatePersistedText(raw: string, maxBytes: number): string {
  const redacted = redactSensitiveCommandOutput(raw ?? "");
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

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_timeline_message ON timeline_events(message_id);
CREATE INDEX IF NOT EXISTS idx_written_message ON written_files(message_id);
CREATE INDEX IF NOT EXISTS idx_conversations_workspace ON conversations(workspace_root, updated_at DESC);
`;

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

  const touchConversation = db.prepare(
    `UPDATE conversations SET updated_at = ? WHERE id = ?`
  );

  const insertConversation = db.prepare(`
    INSERT INTO conversations (id, workspace_root, title, created_at, updated_at)
    VALUES (@id, @workspace_root, @title, @created_at, @updated_at)
  `);

  const selectConversation = db.prepare(`
    SELECT id, workspace_root AS workspaceRoot, title,
           created_at AS createdAt, updated_at AS updatedAt
    FROM conversations WHERE id = ?
  `);

  const listByWorkspace = db.prepare(`
    SELECT id, workspace_root AS workspaceRoot, title,
           created_at AS createdAt, updated_at AS updatedAt
    FROM conversations
    WHERE workspace_root = ?
    ORDER BY updated_at DESC
  `);

  const updateTitle = db.prepare(`
    UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?
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

  const messageExists = db.prepare(`SELECT 1 AS ok FROM messages WHERE id = ?`);

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
    SELECT id, file_path AS filePath, snapshot, created_at AS createdAt
    FROM written_files
    WHERE message_id = ?
    ORDER BY created_at ASC, rowid ASC
  `);

  function mapConversation(row: Record<string, unknown> | undefined): Conversation | null {
    if (!row) return null;
    return {
      id: String(row.id),
      workspaceRoot: String(row.workspaceRoot),
      title: row.title == null ? null : String(row.title),
      createdAt: Number(row.createdAt),
      updatedAt: Number(row.updatedAt),
    };
  }

  const api: AiPersistence = {
    createConversation(root: string, title?: string): string {
      const ws = normalizeWorkspaceRoot(root);
      const id = randomUUID();
      const now = Date.now();
      const safeTitle =
        typeof title === "string" && title.trim()
          ? gatePersistedText(title.trim(), 500)
          : null;
      insertConversation.run({
        id,
        workspace_root: ws,
        title: safeTitle,
        created_at: now,
        updated_at: now,
      });
      return id;
    },

    getConversation(id: string): Conversation | null {
      return mapConversation(selectConversation.get(id) as Record<string, unknown> | undefined);
    },

    listConversations(root: string): Conversation[] {
      const ws = normalizeWorkspaceRoot(root);
      const rows = listByWorkspace.all(ws) as Array<Record<string, unknown>>;
      return rows.map((r) => mapConversation(r)!).filter(Boolean);
    },

    updateConversationTitle(id: string, title: string): void {
      const safe = gatePersistedText(title.trim(), 500);
      updateTitle.run(safe, Date.now(), id);
    },

    deleteConversation(id: string): void {
      deleteConversationStmt.run(id);
    },

    addMessage(
      conversationId: string,
      role: "user" | "assistant",
      content: string,
      streamId?: string
    ): string {
      if (role !== "user" && role !== "assistant") {
        throw new Error("Invalid message role");
      }
      const conv = api.getConversation(conversationId);
      if (!conv) throw new Error("Conversation not found");

      const id = randomUUID();
      const now = Date.now();
      const gated = gatePersistedText(content, AI_PERSIST_MESSAGE_MAX_BYTES);
      insertMessage.run({
        id,
        conversation_id: conversationId,
        role,
        content: gated,
        stream_id: streamId?.trim() || null,
        created_at: now,
      });
      touchConversation.run(now, conversationId);
      return id;
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

    addTimelineEvents(messageId: string, events: TimelineEvent[]): void {
      if (!messageExists.get(messageId)) {
        throw new Error("Message not found");
      }
      const insertMany = db.transaction((list: TimelineEvent[]) => {
        for (const raw of list) {
          const sanitized = sanitizeTimelineEvent(raw as TimelineEventInput);
          const detail =
            typeof sanitized.detail === "string"
              ? gatePersistedText(sanitized.detail, AI_PERSIST_MESSAGE_MAX_BYTES)
              : null;
          insertTimeline.run({
            id: sanitized.id,
            message_id: messageId,
            type: sanitized.type,
            timestamp: sanitized.timestamp,
            label: gatePersistedText(sanitized.label, 500),
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
      const insertMany = db.transaction((list: WrittenFile[]) => {
        for (const file of list) {
          const filePath = normalizeRelPath(file.filePath);
          if (!filePath || filePath.includes("..")) continue;
          const snapshot = gatePersistedText(
            file.snapshot ?? "",
            AI_PERSIST_SNAPSHOT_MAX_BYTES
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
        filePath: String(r.filePath),
        snapshot: String(r.snapshot),
        createdAt: Number(r.createdAt),
      }));
    },

    close(): void {
      db.close();
    },
  };

  return api;
}
