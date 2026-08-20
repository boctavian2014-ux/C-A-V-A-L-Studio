/**
 * Pas 7a.2 — persist assistant message + flush timeline at stream completion.
 * Abort / incomplete streams only clear the in-memory buffer.
 */

import path from "node:path";

import {
  createAiPersistence,
  type AiPersistence,
} from "../db/ai-persistence";
import { clearTimelineBuffer, flushTimeline } from "./timeline-emit";

const persistenceByRoot = new Map<string, AiPersistence>();

function normalizeRoot(workspaceRoot: string): string {
  return path.resolve(workspaceRoot.trim());
}

export function getAiPersistence(workspaceRoot: string): AiPersistence {
  const key = normalizeRoot(workspaceRoot);
  let db = persistenceByRoot.get(key);
  if (!db) {
    db = createAiPersistence(key);
    persistenceByRoot.set(key, db);
  }
  return db;
}

export function resetAiPersistenceCacheForTests(): void {
  for (const db of persistenceByRoot.values()) {
    try {
      db.close();
    } catch {
      // already closed
    }
  }
  persistenceByRoot.clear();
}

export function persistAssistantMessageAndFlush(input: {
  workspaceRoot: string;
  conversationId?: string;
  streamId: string;
  content: string;
  persistence?: AiPersistence;
}): { conversationId: string; messageId: string } | null {
  const root = input.workspaceRoot?.trim();
  if (!root) {
    clearTimelineBuffer(input.streamId);
    return null;
  }

  try {
    const persistence = input.persistence ?? getAiPersistence(root);
    const requestedId = input.conversationId?.trim();
    const conversationId = requestedId
      ? persistence.createConversation(root, "Chat", requestedId)
      : persistence.listConversations(root)[0]?.id ??
        persistence.createConversation(root, "Chat");
    const messageId = persistence.addMessage(
      conversationId,
      "assistant",
      input.content ?? "",
      input.streamId
    );
    flushTimeline(input.streamId, messageId, persistence);
    return { conversationId, messageId };
  } catch {
    clearTimelineBuffer(input.streamId);
    return null;
  }
}

/** Abort / error without a complete assistant message — drop buffer, no INSERT. */
export function discardIncompleteStreamTimeline(streamId: string): void {
  clearTimelineBuffer(streamId);
}
