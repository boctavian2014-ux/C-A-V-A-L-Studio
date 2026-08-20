/**
 * Pas 6.4 — apply / reject staged chat proposals (main writes disk only on Accept).
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
import { assertTrustedSender } from "../ipc-trust";
import type { BoundWorkspaceRootGetter } from "../bound-workspace";
import { requireBoundWorkspaceRoot } from "../bound-workspace";

export function registerChatApplyHandlers(
  getBoundWorkspaceRoot: BoundWorkspaceRootGetter
): void {
  ipcMain.handle(
    "caval:chat-apply-accept",
    async (
      event,
      input: { stageKey?: string; writes?: ProposedWrite[] }
    ) => {
      assertTrustedSender(event);
      const root = requireBoundWorkspaceRoot(getBoundWorkspaceRoot, event.sender.id);
      const fromBuffer =
        typeof input.stageKey === "string" && input.stageKey.trim()
          ? getProposedWrites(input.stageKey)
          : [];
      const writes = sanitizeProposedWrites(
        input.writes?.length ? input.writes : fromBuffer
      );
      if (!writes.length) {
        return { ok: false, error: "No proposed writes to apply", applied: [] as string[] };
      }
      const { applied, errors } = applyProposedWritesToDisk(root, writes);
      if (input.stageKey) clearProposedWrites(input.stageKey);
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
    async (event, input: { stageKey?: string; writes?: ProposedWrite[] }) => {
      assertTrustedSender(event);
      // Reject: nothing on disk yet for deferred proposals — just clear buffer.
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
