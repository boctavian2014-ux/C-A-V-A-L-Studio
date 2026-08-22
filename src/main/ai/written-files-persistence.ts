/**
 * Pas 7a.3 — persist post-Accept file snapshots into written_files.
 * Reject never calls this. Deleted / unreadable files are skipped.
 */

import fs from "node:fs";
import path from "node:path";

import type { AiPersistence, WrittenFile } from "../db/ai-persistence";
import { getAiPersistence } from "./timeline-persistence";
import { normalizeProposedPath } from "../../shared/ai-chat-apply-contract";

export interface WrittenFileSnapshot {
  filePath: string;
  snapshot: string;
}

export interface PersistWrittenFilesResult {
  persisted: string[];
  skipped: string[];
  messageId: string | null;
}

function joinWorkspace(root: string, rel: string): string {
  const sep = root.includes("\\") ? "\\" : "/";
  const clean = rel.replace(/[/\\]+/g, sep).replace(new RegExp(`^\\${sep}+`), "");
  return `${root.replace(/[/\\]+$/, "")}${sep}${clean}`;
}

/**
 * Resolve the DB assistant message that owns Accept snapshots.
 * Prefers an explicit messageId, then streamId match, then latest assistant row.
 */
export function resolveAcceptMessageId(input: {
  persistence: AiPersistence;
  workspaceRoot: string;
  conversationId?: string;
  messageId?: string;
  streamId?: string;
}): string | null {
  const root = input.workspaceRoot?.trim();
  if (!root) return null;

  const requestedConversation = input.conversationId?.trim();
  const conversationId = requestedConversation
    ? input.persistence.createConversation(root, "Chat", requestedConversation)
    : input.persistence.listConversations(root)[0]?.id ??
      input.persistence.createConversation(root, "Chat");

  const messages = input.persistence.getMessages(conversationId);
  const explicit = input.messageId?.trim();
  if (explicit && messages.some((m) => m.id === explicit)) {
    return explicit;
  }

  const streamId = input.streamId?.trim();
  if (streamId) {
    const byStream = [...messages]
      .reverse()
      .find((m) => m.role === "assistant" && m.streamId === streamId);
    if (byStream) return byStream.id;
  }

  const latestAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  if (latestAssistant) return latestAssistant.id;

  return input.persistence.addMessage(
    conversationId,
    "assistant",
    "Accepted file writes",
    streamId
  );
}

/**
 * Read post-apply disk content and INSERT snapshots (redacted + capped in addWrittenFiles).
 */
export function persistWrittenFiles(
  messageId: string,
  filePaths: string[],
  workspaceRoot: string,
  persistence: Pick<AiPersistence, "addWrittenFiles">,
  options?: { inlineSnapshots?: Record<string, string> }
): { persisted: string[]; skipped: string[] } {
  const root = workspaceRoot.trim();
  const files: WrittenFile[] = [];
  const persisted: string[] = [];
  const skipped: string[] = [];
  const inline = options?.inlineSnapshots ?? {};

  for (const rawPath of filePaths) {
    const filePath = normalizeProposedPath(rawPath);
    if (!filePath || filePath.includes("..")) {
      skipped.push(rawPath);
      continue;
    }

    let snapshot: string | null = null;
    const abs = joinWorkspace(root, filePath);
    try {
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
        snapshot = fs.readFileSync(abs, "utf8");
      }
    } catch {
      snapshot = null;
    }

    if (snapshot == null) {
      const fallback = inline[filePath] ?? inline[rawPath];
      if (typeof fallback === "string") {
        snapshot = fallback;
      }
    }

    if (snapshot == null) {
      skipped.push(filePath);
      continue;
    }

    files.push({ filePath, snapshot });
    persisted.push(filePath);
  }

  if (files.length > 0) {
    persistence.addWrittenFiles(messageId, files);
  }
  return { persisted, skipped };
}

/** Accept-path entry: resolve message + persist snapshots. Never throws to callers. */
export function persistAcceptedWrittenFiles(input: {
  workspaceRoot: string;
  filePaths: string[];
  conversationId?: string;
  messageId?: string;
  streamId?: string;
  inlineSnapshots?: Record<string, string>;
  persistence?: AiPersistence;
}): PersistWrittenFilesResult {
  const empty: PersistWrittenFilesResult = {
    persisted: [],
    skipped: [...input.filePaths],
    messageId: null,
  };
  const root = input.workspaceRoot?.trim();
  if (!root || !input.filePaths.length) return empty;

  try {
    const persistence = input.persistence ?? getAiPersistence(root);
    const messageId = resolveAcceptMessageId({
      persistence,
      workspaceRoot: root,
      conversationId: input.conversationId,
      messageId: input.messageId,
      streamId: input.streamId,
    });
    if (!messageId) return empty;

    const { persisted, skipped } = persistWrittenFiles(
      messageId,
      input.filePaths,
      root,
      persistence,
      { inlineSnapshots: input.inlineSnapshots }
    );
    return { persisted, skipped, messageId };
  } catch {
    return empty;
  }
}

/** Test helper — absolute path join without Electron. */
export function resolveWorkspaceFilePath(workspaceRoot: string, filePath: string): string {
  return path.resolve(joinWorkspace(workspaceRoot, normalizeProposedPath(filePath)));
}
