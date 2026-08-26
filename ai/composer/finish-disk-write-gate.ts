/**
 * P0.4 — finish() may write disk only when the #45 trusted-turn gate grants it.
 * Scaffold/create-and-write applies fences, then fallback if nothing landed.
 * Timeout, errors, and propose-only turns still never write from finish().
 */
import {
  allowsDiskWrites,
  resolveTrustedExecutionCapability,
  shouldGrantChatWriteTurn,
  type ExecutionMode,
} from "../modes/execution-mode";
import { TURN_WATCHDOG_ABORT_REASON } from "../../src/shared/turn-watchdog";

export interface FinishDiskWritePlan {
  /** Parsed ```lang:path fences from the model — only when the turn may write. */
  applyParsedFences: boolean;
  /** Minimal Vite/package.json fallback — SCAFFOLD create-and-write only. */
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
 * Timeout/error/proposedWrites never write. Granted write turns apply fences;
 * SCAFFOLD also applies fallback when fences are missing or fail.
 */
export function planFinishDiskWrites(input: FinishDiskWriteInput): FinishDiskWritePlan {
  const closed = turnIsClosed(input);
  const capable = writeCapable(input);
  const mayWrite = !closed && capable;
  return {
    applyParsedFences: mayWrite,
    applyFallbackScaffold: mayWrite && input.effectiveMode === "SCAFFOLD",
    autoInstallDependencies: mayWrite,
    allowWriteFollowup: mayWrite,
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
