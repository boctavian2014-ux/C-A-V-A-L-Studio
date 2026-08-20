/**
 * Pas 7a.5 — ephemeral JSON/Markdown export for conversation history.
 * Content is generated on demand; never written to the AI history DB.
 * Written-file snapshots are omitted — only relative paths are exported.
 */

import type { AiPersistence } from "../db/ai-persistence";
import {
  formatHistoryTitle,
  HISTORY_EXPORT_WARN_BYTES,
  type ExportFormat,
  type ExportResult,
} from "../../shared/ai-history-contract";
import { getAiPersistence } from "./timeline-persistence";
import { loadHistoryConversation } from "./ai-history-service";

export interface HistoryExportConversation {
  id: string;
  title: string;
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    createdAt: number;
  }>;
  timelineByMessage: Record<
    string,
    Array<{ type: string; label: string; detail?: string; timestamp: number }>
  >;
  writtenFilesByMessage: Record<string, Array<{ filePath: string }>>;
}

export function slugifyExportTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "chat";
}

export function buildJsonExport(conv: HistoryExportConversation): string {
  const payload = {
    title: conv.title,
    exportedAt: new Date().toISOString(),
    messages: conv.messages.map((m) => ({
      role: m.role,
      content: m.content,
      createdAt: new Date(m.createdAt).toISOString(),
      timeline: conv.timelineByMessage[m.id]?.map((e) => ({
        type: e.type,
        label: e.label,
        detail: e.detail,
        timestamp: new Date(e.timestamp).toISOString(),
      })),
      writtenFiles: conv.writtenFilesByMessage[m.id]?.map((f) => f.filePath),
    })),
  };
  return JSON.stringify(payload, null, 2);
}

export function buildMarkdownExport(conv: HistoryExportConversation): string {
  const lines: string[] = [`# ${conv.title}`, ""];

  for (const msg of conv.messages) {
    lines.push(`## ${msg.role === "user" ? "User" : "Assistant"}`, "", msg.content, "");

    const timeline = conv.timelineByMessage[msg.id];
    if (timeline?.length) {
      lines.push("**Activity:**");
      for (const e of timeline) {
        lines.push(`- \`${e.type}\` ${e.label}`);
      }
      lines.push("");
    }

    const files = conv.writtenFilesByMessage[msg.id];
    if (files?.length) {
      lines.push("**Files changed:**");
      for (const f of files) {
        lines.push(`- ${f.filePath}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

function toExportConversation(
  workspaceRoot: string,
  conversationId: string,
  persistence?: AiPersistence
): HistoryExportConversation | null {
  const root = workspaceRoot.trim();
  const id = conversationId.trim();
  if (!root || !id) return null;

  const db = persistence ?? getAiPersistence(root);
  const row = db.getConversation(id);
  if (!row) return null;

  const payload = loadHistoryConversation(root, id, db);
  if (!payload) return null;

  const timelineByMessage: HistoryExportConversation["timelineByMessage"] = {};
  for (const [msgId, events] of Object.entries(payload.timelineByMessage)) {
    timelineByMessage[msgId] = events.map((e) => ({
      type: e.type,
      label: e.label,
      ...(e.detail ? { detail: e.detail } : {}),
      timestamp: e.timestamp,
    }));
  }

  const writtenFilesByMessage: HistoryExportConversation["writtenFilesByMessage"] = {};
  for (const [msgId, files] of Object.entries(payload.writtenFilesByMessage)) {
    writtenFilesByMessage[msgId] = files.map((f) => ({ filePath: f.filePath }));
  }

  return {
    id,
    title: formatHistoryTitle(row.title),
    messages: payload.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    })),
    timelineByMessage,
    writtenFilesByMessage,
  };
}

export function exportHistoryConversation(
  workspaceRoot: string,
  conversationId: string,
  format: ExportFormat,
  options?: {
    acknowledgeLarge?: boolean;
    persistence?: AiPersistence;
    /** Override soft cap (tests). */
    warnBytes?: number;
  }
): ExportResult {
  const conv = toExportConversation(workspaceRoot, conversationId, options?.persistence);
  if (!conv) {
    return { success: false, error: "Conversation not found" };
  }

  const content =
    format === "json" ? buildJsonExport(conv) : buildMarkdownExport(conv);
  const byteLength = Buffer.byteLength(content, "utf8");
  const ext = format === "json" ? "json" : "md";
  const suggestedFilename = `${slugifyExportTitle(conv.title)}-${conv.id.slice(0, 8)}.${ext}`;
  const warnBytes = options?.warnBytes ?? HISTORY_EXPORT_WARN_BYTES;

  if (byteLength > warnBytes && !options?.acknowledgeLarge) {
    return {
      success: false,
      error: `Export exceeds ${warnBytes} bytes (${byteLength}). Confirm to continue.`,
      sizeWarning: true,
      byteLength,
      suggestedFilename,
    };
  }

  return {
    success: true,
    content,
    suggestedFilename,
    byteLength,
  };
}
