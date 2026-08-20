/**
 * Pas 7a.4 — IPC for AI conversation history (bound workspace only).
 */

import { ipcMain } from "electron";

import { assertTrustedSender } from "../ipc-trust";
import type { BoundWorkspaceRootGetter } from "../bound-workspace";
import { requireBoundWorkspaceRoot } from "../bound-workspace";
import {
  deleteHistoryConversation,
  listHistoryConversations,
  loadHistoryConversation,
  revertHistoryWrittenFile,
} from "./ai-history-service";

export function registerAiHistoryHandlers(
  getBoundWorkspaceRoot: BoundWorkspaceRootGetter
): void {
  ipcMain.handle("caval:ai-history-list", async (event) => {
    assertTrustedSender(event);
    const root = requireBoundWorkspaceRoot(getBoundWorkspaceRoot, event.sender.id);
    return { ok: true, conversations: listHistoryConversations(root) };
  });

  ipcMain.handle(
    "caval:ai-history-get",
    async (event, input: { conversationId?: string }) => {
      assertTrustedSender(event);
      const root = requireBoundWorkspaceRoot(getBoundWorkspaceRoot, event.sender.id);
      const id = input?.conversationId?.trim();
      if (!id) return { ok: false, error: "Missing conversationId" };
      const payload = loadHistoryConversation(root, id);
      if (!payload) return { ok: false, error: "Conversation not found" };
      return { ok: true, conversation: payload };
    }
  );

  ipcMain.handle(
    "caval:ai-history-delete",
    async (event, input: { conversationId?: string }) => {
      assertTrustedSender(event);
      const root = requireBoundWorkspaceRoot(getBoundWorkspaceRoot, event.sender.id);
      const id = input?.conversationId?.trim();
      if (!id) return { ok: false, error: "Missing conversationId" };
      return deleteHistoryConversation(root, id);
    }
  );

  ipcMain.handle(
    "caval:ai-history-revert-written",
    async (event, input: { writtenFileId?: string }) => {
      assertTrustedSender(event);
      const root = requireBoundWorkspaceRoot(getBoundWorkspaceRoot, event.sender.id);
      const id = input?.writtenFileId?.trim();
      if (!id) return { ok: false, error: "Missing writtenFileId" };
      return revertHistoryWrittenFile(root, id);
    }
  );
}
