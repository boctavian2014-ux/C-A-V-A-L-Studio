import {
  ROBOTICS_FIRST_TOKEN_MS,
  ROBOTICS_IDLE_DELTA_MS,
  ROBOTICS_TOTAL_TURN_MS,
  TURN_WATCHDOG_USER_MESSAGE,
  isRoboticsEngineeringStreamId,
  timeoutMsForAgentMode,
} from "../../shared/turn-watchdog";
import { shutdownMark } from "../shutdown-diagnostics";

type TerminalSender = {
  send: (chunk: Record<string, unknown>) => boolean;
};

type EngWatchdogState = {
  abort: () => void;
  stream: TerminalSender;
  firstTokenTimer?: ReturnType<typeof setTimeout>;
  idleTimer?: ReturnType<typeof setTimeout>;
  hardTimer?: ReturnType<typeof setTimeout>;
  gotFirstDelta: boolean;
  armedAtMs: number;
};

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const engStates = new Map<string, EngWatchdogState>();
const emitted = new Set<string>();

export function emitTurnWatchdogTimeout(
  stream: TerminalSender,
  streamId: string
): boolean {
  if (emitted.has(streamId)) return false;
  emitted.add(streamId);
  stream.send({
    type: "error",
    error: TURN_WATCHDOG_USER_MESSAGE,
    timedOut: true,
    code: "turn_watchdog_timeout",
  });
  stream.send({ type: "done", timedOut: true });
  return true;
}

export function wasTurnWatchdogEmitted(streamId: string): boolean {
  return emitted.has(streamId);
}

function fireWatchdog(
  streamId: string,
  abort: () => void,
  stream: TerminalSender,
  reason: "first_token" | "idle" | "hard" | "mode"
): void {
  console.warn(`[robotics] turn-watchdog fire streamId=${streamId} reason=${reason}`);
  abort();
  emitTurnWatchdogTimeout(stream, streamId);
}

function clearEngState(streamId: string): void {
  const state = engStates.get(streamId);
  if (!state) return;
  if (state.firstTokenTimer) clearTimeout(state.firstTokenTimer);
  if (state.idleTimer) clearTimeout(state.idleTimer);
  if (state.hardTimer) clearTimeout(state.hardTimer);
  engStates.delete(streamId);
}

/**
 * Robotics eng-*: longer first-token wait + idle-between-deltas + hard total.
 * Other streams: single mode-based timeout (unchanged).
 */
export function armTurnWatchdog(opts: {
  streamId: string;
  mode: string | undefined;
  stream: TerminalSender;
  abort: () => void;
}): () => void {
  const { streamId, mode, stream, abort } = opts;
  disarmTurnWatchdog(streamId);

  const envMs = Number(process.env.CAVAL_TURN_TIMEOUT_MS);
  const envOverride = Number.isFinite(envMs) && envMs > 0 ? envMs : 0;

  if (isRoboticsEngineeringStreamId(streamId)) {
    const firstMs = envOverride || ROBOTICS_FIRST_TOKEN_MS;
    const hardMs = envOverride || ROBOTICS_TOTAL_TURN_MS;
    console.log(
      `[robotics] turn-watchdog arm eng streamId=${streamId} firstTokenMs=${firstMs} hardMs=${hardMs}`
    );
    const state: EngWatchdogState = {
      abort,
      stream,
      gotFirstDelta: false,
      armedAtMs: Date.now(),
    };
    state.firstTokenTimer = setTimeout(() => {
      state.firstTokenTimer = undefined;
      clearEngState(streamId);
      timers.delete(streamId);
      fireWatchdog(streamId, abort, stream, "first_token");
    }, firstMs);
    state.hardTimer = setTimeout(() => {
      state.hardTimer = undefined;
      clearEngState(streamId);
      timers.delete(streamId);
      fireWatchdog(streamId, abort, stream, "hard");
    }, hardMs);
    engStates.set(streamId, state);
    return () => disarmTurnWatchdog(streamId);
  }

  const ms = timeoutMsForAgentMode(mode);
  const waitMs = envOverride || ms;
  const timer = setTimeout(() => {
    timers.delete(streamId);
    fireWatchdog(streamId, abort, stream, "mode");
  }, waitMs);
  timers.set(streamId, timer);
  return () => disarmTurnWatchdog(streamId);
}

/**
 * Call on each assistant delta. For eng-* streams: clears first-token timer
 * and resets the idle-between-deltas window.
 */
export function noteTurnWatchdogProgress(streamId: string): void {
  const state = engStates.get(streamId);
  if (!state) return;

  if (!state.gotFirstDelta) {
    const ttftMs = Date.now() - state.armedAtMs;
    console.log(`[robotics] eng TTFT streamId=${streamId} ms=${ttftMs}`);
  }

  if (state.firstTokenTimer) {
    clearTimeout(state.firstTokenTimer);
    state.firstTokenTimer = undefined;
  }
  state.gotFirstDelta = true;

  if (state.idleTimer) clearTimeout(state.idleTimer);
  state.idleTimer = setTimeout(() => {
    state.idleTimer = undefined;
    clearEngState(streamId);
    timers.delete(streamId);
    fireWatchdog(streamId, state.abort, state.stream, "idle");
  }, ROBOTICS_IDLE_DELTA_MS);
}

export function clearAllTurnWatchdogs(): void {
  shutdownMark("turn-watchdog-clear", { count: timers.size + engStates.size });
  resetTurnWatchdogForTests();
}

export function disarmTurnWatchdog(streamId: string): void {
  const timer = timers.get(streamId);
  if (timer) {
    clearTimeout(timer);
    timers.delete(streamId);
  }
  clearEngState(streamId);
  emitted.delete(streamId);
}

/** @internal tests */
export function resetTurnWatchdogForTests(): void {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  for (const id of [...engStates.keys()]) clearEngState(id);
  emitted.clear();
}

/** @internal tests */
export function turnWatchdogTimerCountForTests(): number {
  return timers.size + engStates.size;
}
