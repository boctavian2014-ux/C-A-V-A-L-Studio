import type { ProposedWrite } from "../../src/shared/ai-chat-apply-contract";
import {
  shouldAllowChatApplyAccept,
  type TrustedExecutionCapability,
} from "../modes/execution-mode";
import { stageProposedWrites } from "../../src/main/ai/proposed-writes-buffer";
import { proposeScaffoldWrites } from "./scaffold-apply-node";

export interface StageDirectChatScaffoldInput {
  workspaceRoot: string | undefined;
  text: string;
  capability: Pick<TrustedExecutionCapability, "effective">;
  stageKey: string;
  /** Watchdog / user abort — never stage a partial turn. */
  aborted?: boolean;
}

/**
 * Direct Code/Debug done path: parse fences and stage the same turn-bound
 * buffer Agentic uses. Does not write disk.
 */
export function stageDirectChatScaffoldProposal(
  input: StageDirectChatScaffoldInput
): ProposedWrite[] {
  if (input.aborted) return [];
  if (!shouldAllowChatApplyAccept(input.capability)) return [];
  const root = input.workspaceRoot?.trim();
  const key = input.stageKey.trim();
  if (!root || !key || !input.text.trim()) return [];

  const proposed = proposeScaffoldWrites(root, input.text);
  if (proposed.length === 0) return [];
  return stageProposedWrites(key, proposed);
}
