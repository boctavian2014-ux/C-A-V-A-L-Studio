/**
 * Main-owned chat write turns. Renderer stream ids are tracked here after
 * capability is resolved from the user message — never from IPC flags.
 */
import {
  shouldAllowChatApplyAccept,
  type ExecutionMode,
} from "../../../ai/modes/execution-mode";

export interface TrustedChatTurn {
  senderId: number;
  streamId: string;
  mainResolved: ExecutionMode;
  effective: ExecutionMode;
}

const MAX_TURNS = 64;
const turns = new Map<string, TrustedChatTurn>();

function remember(key: string, turn: TrustedChatTurn): void {
  const id = key.trim();
  if (!id) return;
  if (turns.has(id)) turns.delete(id);
  turns.set(id, turn);
  while (turns.size > MAX_TURNS) {
    const oldest = turns.keys().next().value;
    if (!oldest) break;
    turns.delete(oldest);
  }
}

export function registerTrustedChatTurn(
  turn: TrustedChatTurn,
  aliases: string[] = []
): void {
  remember(turn.streamId, turn);
  for (const alias of aliases) remember(alias, turn);
}

export function getTrustedChatTurn(turnId: string | undefined): TrustedChatTurn | undefined {
  const id = turnId?.trim();
  if (!id) return undefined;
  return turns.get(id);
}

export function revokeTrustedChatTurn(turnId: string | undefined): void {
  const id = turnId?.trim();
  if (!id) return;
  const turn = turns.get(id);
  if (!turn) {
    turns.delete(id);
    return;
  }
  for (const [key, value] of [...turns.entries()]) {
    if (value.senderId === turn.senderId && value.streamId === turn.streamId) {
      turns.delete(key);
    }
  }
}

export function trustedTurnAllowsApply(turn: TrustedChatTurn, senderId: number): boolean {
  if (turn.senderId !== senderId) return false;
  return shouldAllowChatApplyAccept(turn);
}

export function resetTrustedChatTurnsForTests(): void {
  turns.clear();
}
