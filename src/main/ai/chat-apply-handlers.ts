/**
 * Pas 6.4 — apply / reject staged chat proposals (main writes disk only on Accept).
 * Pas 7a.3 — after Accept, persist post-apply snapshots into written_files.
 * Writes require a matching main-owned trusted turn. Renderer payloads cannot escalate.
 */

import { ipcMain } from "electron";

import {
  applyProposedWritesToDisk,
  revertNewProposedWrites,
} from "../../../ai/composer/scaffold-apply-node";
import type { ProposedWrite } from "../../shared/ai-chat-apply-contract";
import { sanitizeProposedWrites } from "../../shared/ai-chat-apply-contract";
import {
  clearProposedWrites,
  getProposedWrites,
} from "./proposed-writes-buffer";
import { persistAcceptedWrittenFiles } from "./written-files-persistence";
import { assertTrustedSender } from "../ipc-trust";
import type { BoundWorkspaceRootGetter } from "../bound-workspace";
import { requireBoundWorkspaceRoot } from "../bound-workspace";
import {
  getTrustedChatTurn,
  revokeTrustedChatTurn,
  trustedTurnAllowsApply,
  type TrustedChatTurn,
} from "./trusted-chat-turn";

function applyLookupKeys(input: { stageKey?: string; streamId?: string }): string[] {
  const keys: string[] = [];
  for (const raw of [input.streamId, input.stageKey]) {
    const id = typeof raw === "string" ? raw.trim() : "";
    if (id && !keys.includes(id)) keys.push(id);
  }
  return keys;
}

function resolveTrustedApplyTurn(input: {
  stageKey?: string;
  streamId?: string;
}): TrustedChatTurn | undefined {
  for (const key of applyLookupKeys(input)) {
    const turn = getTrustedChatTurn(key);
    if (turn) return turn;
  }
  return undefined;
}

export function registerChatApplyHandlers(
  getBoundWorkspaceRoot: BoundWorkspaceRootGetter
): void {
  ipcMain.handle(
    "caval:chat-apply-accept",
    async (
      event,
      input: {
        stageKey?: string;
        writes?: ProposedWrite[];
        conversationId?: string;
        messageId?: string;
        streamId?: string;
      }
    ) => {
      assertTrustedSender(event);
      const senderId = event.sender.id;
      const turn = resolveTrustedApplyTurn(input);
      if (!turn || !trustedTurnAllowsApply(turn, senderId)) {
        return {
          ok: false,
          error: "Write rejected: untrusted turn.",
          applied: [] as string[],
        };
      }

      const root = requireBoundWorkspaceRoot(getBoundWorkspaceRoot, senderId);
      let fromBuffer: ProposedWrite[] = [];
      for (const key of [...applyLookupKeys(input), turn.streamId]) {
        fromBuffer = getProposedWrites(key);
        if (fromBuffer.length) break;
      }
      const writes = sanitizeProposedWrites(fromBuffer.length ? fromBuffer : input.writes ?? []);
      if (!writes.length) {
        return { ok: false, error: "No proposed writes to apply", applied: [] as string[] };
      }
      const { applied, errors } = applyProposedWritesToDisk(root, writes);
      for (const key of applyLookupKeys(input)) clearProposedWrites(key);
      if (applied.length > 0) {
        const inlineSnapshots: Record<string, string> = {};
        for (const w of writes) {
          if (applied.includes(w.path)) inlineSnapshots[w.path] = w.content;
        }
        persistAcceptedWrittenFiles({
          workspaceRoot: root,
          filePaths: applied,
          conversationId: input.conversationId,
          messageId: input.messageId,
          streamId: input.streamId ?? turn.streamId,
          inlineSnapshots,
        });
        revokeTrustedChatTurn(turn.streamId);
      }

      return {
        ok: errors.length === 0 && applied.length > 0,
        applied,
        writes,
        errors,
      };
    }
  );

  ipcMain.handle(
    "caval:chat-apply-reject",
    async (event, input: { stageKey?: string; writes?: ProposedWrite[]; streamId?: string }) => {
      assertTrustedSender(event);
      const senderId = event.sender.id;
      const turn = resolveTrustedApplyTurn(input);
      if (turn && turn.senderId === senderId) {
        revokeTrustedChatTurn(turn.streamId);
      }
      if (input.stageKey) clearProposedWrites(input.stageKey);
      return { ok: true };
    }
  );

  ipcMain.handle(
    "caval:chat-apply-revert-new",
    async (event, input: { writes: ProposedWrite[] }) => {
      assertTrustedSender(event);
      const root = requireBoundWorkspaceRoot(getBoundWorkspaceRoot, event.sender.id);
      const writes = sanitizeProposedWrites(input.writes ?? []);
      const { deleted, errors } = revertNewProposedWrites(root, writes);
      return { ok: errors.length === 0, deleted, errors };
    }
  );
}
