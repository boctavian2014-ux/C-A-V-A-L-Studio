import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ASK_TURN_TIMEOUT_MS,
  AGENTIC_TURN_TIMEOUT_MS,
  CODE_TURN_TIMEOUT_MS,
  PLAN_TURN_TIMEOUT_MS,
  TURN_WATCHDOG_USER_MESSAGE,
  normalizeTurnWatchdogMode,
  timeoutMsForAgentMode,
} from "../../src/shared/turn-watchdog";
import { markActivityTimedOut } from "../../ai/composer/chat-activity-types";
import {
  armTurnWatchdog,
  resetTurnWatchdogForTests,
  turnWatchdogTimerCountForTests,
  wasTurnWatchdogEmitted,
} from "../../src/main/ai/turn-watchdog-runtime";

describe("turn watchdog", () => {
  afterEach(() => {
    resetTurnWatchdogForTests();
    vi.useRealTimers();
  });

  it("maps UI modes to finite timeouts", () => {
    expect(normalizeTurnWatchdogMode("ask")).toBe("ask");
    expect(normalizeTurnWatchdogMode("architect")).toBe("plan");
    expect(timeoutMsForAgentMode("ask")).toBe(ASK_TURN_TIMEOUT_MS);
    expect(timeoutMsForAgentMode("plan")).toBe(PLAN_TURN_TIMEOUT_MS);
    expect(timeoutMsForAgentMode("code")).toBe(CODE_TURN_TIMEOUT_MS);
    expect(timeoutMsForAgentMode("debug")).toBe(CODE_TURN_TIMEOUT_MS);
    expect(timeoutMsForAgentMode("agentic")).toBe(AGENTIC_TURN_TIMEOUT_MS);
    expect(timeoutMsForAgentMode(undefined)).toBe(ASK_TURN_TIMEOUT_MS);
  });

  it("emits one safe timeout message and disarms", () => {
    vi.useFakeTimers();
    const sent: Array<Record<string, unknown>> = [];
    const stream = { send: (chunk: Record<string, unknown>) => { sent.push(chunk); return true; } };
    const abort = vi.fn();
    armTurnWatchdog({ streamId: "s1", mode: "ask", stream, abort });
    expect(turnWatchdogTimerCountForTests()).toBe(1);
    vi.advanceTimersByTime(ASK_TURN_TIMEOUT_MS);
    expect(abort).toHaveBeenCalledTimes(1);
    expect(wasTurnWatchdogEmitted("s1")).toBe(true);
    expect(sent).toEqual([
      { type: "error", error: TURN_WATCHDOG_USER_MESSAGE, timedOut: true },
      { type: "done", timedOut: true },
    ]);
    expect(turnWatchdogTimerCountForTests()).toBe(0);
  });

  it("marks leftover activity steps timed_out", () => {
    const steps = markActivityTimedOut([
      { id: "prepare", label: "Pregătesc context", status: "done" },
      { id: "think", label: "Reasoning", status: "active" },
      { id: "write", label: "Scriu răspunsul", status: "pending" },
    ]);
    expect(steps[0]?.status).toBe("done");
    expect(steps[1]?.status).toBe("timed_out");
    expect(steps[2]?.status).toBe("timed_out");
  });
});
