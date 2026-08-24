/**
 * P0.4 — finish() must not write disk outside the #45 trusted-turn gate.
 * Fences, fallback scaffold, and timeout cleanup are not write capability.
 */
import {
  allowsDiskWrites,
  resolveTrustedExecutionCapability,
  shouldGrantChatWriteTurn,
  type ExecutionMode,
} from "../modes/execution-mode";
import { TURN_WATCHDOG_ABORT_REASON } from "../../src/shared/turn-watchdog";

export interface FinishDiskWritePlan {
  /** Parsed ```lang:path fences from the model. Always false in finish(). */
  applyParsedFences: boolean;
  /** Invented Vite/package.json fallback. Always false in finish(). */
  applyFallbackScaffold: boolean;
  /** npm/verify auto-install after files already written by a granted tool turn. */
  autoInstallDependencies: boolean;
  /** SCAFFOLD_CONTINUE / repair waves spawned from finish(). */
  allowWriteFollowup: boolean;
}

export interface FinishDiskWriteInput {
  error?: string | null;
  timedOut?: boolean;
  hasProposedWrites: boolean;
  effectiveMode: ExecutionMode;
  writeTurnGranted: boolean;
}

function turnIsClosed(input: FinishDiskWriteInput): boolean {
  return Boolean(input.timedOut) || Boolean(input.error) || input.hasProposedWrites;
}

function writeCapable(input: FinishDiskWriteInput): boolean {
  return allowsDiskWrites(input.effectiveMode) && input.writeTurnGranted;
}

/**
 * Disk mutations that finish() is allowed to perform.
 * Fence-only and fallback never write; timeout/error never write.
 */
export function planFinishDiskWrites(input: FinishDiskWriteInput): FinishDiskWritePlan {
  const closed = turnIsClosed(input);
  const capable = writeCapable(input);
  return {
    applyParsedFences: false,
    applyFallbackScaffold: false,
    autoInstallDependencies: !closed && capable,
    allowWriteFollowup: !closed && capable,
  };
}

export function isWatchdogTimeoutError(error: string | null | undefined): boolean {
  return error === TURN_WATCHDOG_ABORT_REASON || error === "timed_out";
}

export function planFinishDiskWritesForUserMessage(input: {
  userMessage: string;
  error?: string | null;
  timedOut?: boolean;
  hasProposedWrites?: boolean;
}): FinishDiskWritePlan {
  const capability = resolveTrustedExecutionCapability({
    userMessage: input.userMessage,
  });
  const timedOut = Boolean(input.timedOut) || isWatchdogTimeoutError(input.error);
  return planFinishDiskWrites({
    error: input.error,
    timedOut,
    hasProposedWrites: Boolean(input.hasProposedWrites),
    effectiveMode: capability.effective,
    writeTurnGranted: shouldGrantChatWriteTurn(capability),
  });
}

/** Creating a Desktop/Downloads folder is a disk write — same gate as finish(). */
export function shouldAutoCreateDesktopWorkspace(userMessage: string): boolean {
  const capability = resolveTrustedExecutionCapability({ userMessage });
  return shouldGrantChatWriteTurn(capability);
}
