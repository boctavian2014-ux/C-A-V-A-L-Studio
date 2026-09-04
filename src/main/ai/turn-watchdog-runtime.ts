import {
  TURN_WATCHDOG_USER_MESSAGE,
  timeoutMsForAgentMode,
} from "../../shared/turn-watchdog";
import { shutdownMark } from "../shutdown-diagnostics";

type TerminalSender = {
  send: (chunk: Record<string, unknown>) => boolean;
};

const timers = new Map<string, ReturnType<typeof setTimeout>>();
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
  });
  stream.send({ type: "done", timedOut: true });
  return true;
}

export function wasTurnWatchdogEmitted(streamId: string): boolean {
  return emitted.has(streamId);
}

export function armTurnWatchdog(opts: {
  streamId: string;
  mode: string | undefined;
  stream: TerminalSender;
  abort: () => void;
}): () => void {
  const { streamId, mode, stream, abort } = opts;
  disarmTurnWatchdog(streamId);
  const ms = timeoutMsForAgentMode(mode);
  const envMs = Number(process.env.CAVAL_TURN_TIMEOUT_MS);
  const waitMs = Number.isFinite(envMs) && envMs > 0 ? envMs : ms;
  const timer = setTimeout(() => {
    timers.delete(streamId);
    abort();
    emitTurnWatchdogTimeout(stream, streamId);
  }, waitMs);
  timers.set(streamId, timer);
  return () => disarmTurnWatchdog(streamId);
}

export function clearAllTurnWatchdogs(): void {
  shutdownMark("turn-watchdog-clear", { count: timers.size });
  resetTurnWatchdogForTests();
}

export function disarmTurnWatchdog(streamId: string): void {
  const timer = timers.get(streamId);
  if (timer) {
    clearTimeout(timer);
    timers.delete(streamId);
  }
  emitted.delete(streamId);
}

/** @internal tests */
export function resetTurnWatchdogForTests(): void {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  emitted.clear();
}

/** @internal tests */
export function turnWatchdogTimerCountForTests(): number {
  return timers.size;
}
