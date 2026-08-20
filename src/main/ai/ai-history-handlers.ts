/**
 * Pas 7a.4–7a.5 — IPC for AI conversation history + ephemeral export (bound workspace only).
 */

import { ipcMain } from "electron";

import { assertTrustedSender } from "../ipc-trust";
import type { BoundWorkspaceRootGetter } from "../bound-workspace";
import { requireBoundWorkspaceRoot } from "../bound-workspace";
import type { ExportFormat } from "../../shared/ai-history-contract";
import { exportHistoryConversation } from "./ai-history-export";
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

  ipcMain.handle(
    "caval:ai-history-export",
    async (
      event,
      input: {
        conversationId?: string;
        format?: ExportFormat;
        acknowledgeLarge?: boolean;
      }
    ) => {
      assertTrustedSender(event);
      const root = requireBoundWorkspaceRoot(getBoundWorkspaceRoot, event.sender.id);
      const id = input?.conversationId?.trim();
      const format = input?.format;
      if (!id) return { success: false, error: "Missing conversationId" };
      if (format !== "json" && format !== "markdown") {
        return { success: false, error: "Invalid format" };
      }
      return exportHistoryConversation(root, id, format, {
        acknowledgeLarge: Boolean(input?.acknowledgeLarge),
      });
    }
  );
}
