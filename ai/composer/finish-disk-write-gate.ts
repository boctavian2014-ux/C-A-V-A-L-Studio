/**
 * P0.4 — finish() may write disk only when the #45 trusted-turn gate grants it.
 * Scaffold/create-and-write applies fences, then fallback if nothing landed.
 * Watchdog timeout on an explicit create-and-write turn still recovers a
 * runnable project (partial fences, else Vite fallback) instead of leaving
 * an empty workspace. Other timeouts, errors, and propose-only turns never write.
 */
import {
  allowsDiskWrites,
  isStrictReadOnlyUiMode,
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
  /** Watchdog timeout on an explicit create-and-write turn — recover without follow-up. */
  timeoutRecovery: boolean;
}

export interface FinishDiskWriteInput {
  error?: string | null;
  timedOut?: boolean;
  hasProposedWrites: boolean;
  effectiveMode: ExecutionMode;
  writeTurnGranted: boolean;
}

export const TIMEOUT_SCAFFOLD_RECOVERY_MESSAGE =
  "Timpul alocat modelului s-a încheiat. Am creat un proiect minim funcțional în workspace ca să poți deschide și previzualiza. Răspunsul complet nu a fost generat de model.";

export const TIMEOUT_SCAFFOLD_PARTIAL_MESSAGE =
  "Timpul alocat modelului s-a încheiat. Am salvat fișierele sigure deja generate. Răspunsul complet nu a fost generat de model.";

export const TIMEOUT_SCAFFOLD_RECOVERY_FAILED_MESSAGE =
  "Timpul alocat modelului s-a încheiat și nu am putut scrie un proiect minim în workspace.";

function writeCapable(input: FinishDiskWriteInput): boolean {
  return allowsDiskWrites(input.effectiveMode) && input.writeTurnGranted;
}

function isTimeout(input: Pick<FinishDiskWriteInput, "error" | "timedOut">): boolean {
  return Boolean(input.timedOut) || isWatchdogTimeoutError(input.error);
}

/**
 * Disk mutations that finish() is allowed to perform.
 * Propose-only and non-timeout errors never write.
 * Granted write turns apply fences; SCAFFOLD also applies fallback.
 * Explicit SCAFFOLD timeout recovers fences/fallback without follow-up or install.
 */
export function planFinishDiskWrites(input: FinishDiskWriteInput): FinishDiskWritePlan {
  const timeout = isTimeout(input);
  const capable = writeCapable(input);
  const timeoutRecovery =
    timeout && capable && input.effectiveMode === "SCAFFOLD" && !input.hasProposedWrites;
  const closed =
    input.hasProposedWrites || (Boolean(input.error) && !timeout) || (timeout && !timeoutRecovery);
  const mayWrite = (!closed && capable) || timeoutRecovery;
  return {
    applyParsedFences: mayWrite,
    applyFallbackScaffold: mayWrite && input.effectiveMode === "SCAFFOLD",
    autoInstallDependencies: mayWrite && !timeoutRecovery,
    allowWriteFollowup: mayWrite && !timeoutRecovery,
    timeoutRecovery,
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
  agentMode?: string;
}): FinishDiskWritePlan {
  const capability = resolveTrustedExecutionCapability({
    userMessage: input.userMessage,
    agentMode: input.agentMode,
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

export function buildTimeoutScaffoldRecoveryPatch(input: {
  written: string[];
  usedFallback: boolean;
  applyErrors?: string[];
}): { content: string; error: string; timeoutRecovered: boolean; writtenFiles: string[] } {
  if (input.written.length === 0) {
    const detail = input.applyErrors?.filter(Boolean)[0];
    return {
      content: detail
        ? `${TIMEOUT_SCAFFOLD_RECOVERY_FAILED_MESSAGE}\n${detail}`
        : TIMEOUT_SCAFFOLD_RECOVERY_FAILED_MESSAGE,
      error: TURN_WATCHDOG_ABORT_REASON,
      timeoutRecovered: false,
      writtenFiles: [],
    };
  }
  return {
    content: input.usedFallback
      ? TIMEOUT_SCAFFOLD_RECOVERY_MESSAGE
      : TIMEOUT_SCAFFOLD_PARTIAL_MESSAGE,
    error: TURN_WATCHDOG_ABORT_REASON,
    timeoutRecovered: true,
    writtenFiles: input.written,
  };
}

/** Creating a Desktop/Downloads folder is a disk write — same gate as finish(). */
export function shouldAutoCreateDesktopWorkspace(
  userMessage: string,
  agentMode?: string
): boolean {
  if (isStrictReadOnlyUiMode(agentMode)) return false;
  const capability = resolveTrustedExecutionCapability({ userMessage, agentMode });
  return shouldGrantChatWriteTurn(capability);
}
