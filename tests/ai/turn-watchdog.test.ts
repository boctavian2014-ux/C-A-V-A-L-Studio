import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ASK_TURN_TIMEOUT_MS,
  AGENTIC_TURN_TIMEOUT_MS,
  CODE_TURN_TIMEOUT_MS,
  PLAN_TURN_TIMEOUT_MS,
  ROBOTICS_FIRST_TOKEN_MS,
  ROBOTICS_IDLE_DELTA_MS,
  ROBOTICS_TOTAL_TURN_MS,
  TURN_WATCHDOG_USER_MESSAGE,
  isRoboticsEngineeringStreamId,
  normalizeTurnWatchdogMode,
  timeoutMsForAgentMode,
} from "../../src/shared/turn-watchdog";
import { markActivityTimedOut } from "../../ai/composer/chat-activity-types";
import {
  armTurnWatchdog,
  noteTurnWatchdogProgress,
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

  it("detects Robotics eng-* stream ids", () => {
    expect(isRoboticsEngineeringStreamId("eng-1-abc")).toBe(true);
    expect(isRoboticsEngineeringStreamId("chat-1")).toBe(false);
  });

  it("emits one safe timeout message and disarms", () => {
    vi.useFakeTimers();
    const sent: Array<Record<string, unknown>> = [];
    const stream = {
      send: (chunk: Record<string, unknown>) => {
        sent.push(chunk);
        return true;
      },
    };
    const abort = vi.fn();
    armTurnWatchdog({ streamId: "s1", mode: "ask", stream, abort });
    expect(turnWatchdogTimerCountForTests()).toBe(1);
    vi.advanceTimersByTime(ASK_TURN_TIMEOUT_MS);
    expect(abort).toHaveBeenCalledTimes(1);
    expect(wasTurnWatchdogEmitted("s1")).toBe(true);
    expect(sent).toEqual([
      {
        type: "error",
        error: TURN_WATCHDOG_USER_MESSAGE,
        timedOut: true,
        code: "turn_watchdog_timeout",
      },
      { type: "done", timedOut: true },
    ]);
    expect(turnWatchdogTimerCountForTests()).toBe(0);
  });

  it("Robotics eng-* waits longer for first token then idles between deltas", () => {
    vi.useFakeTimers();
    const abort = vi.fn();
    armTurnWatchdog({
      streamId: "eng-test-1",
      mode: "ask",
      stream: { send: () => true },
      abort,
    });

    // Under the old ask timeout — must NOT fire for eng-*.
    vi.advanceTimersByTime(ASK_TURN_TIMEOUT_MS);
    expect(abort).not.toHaveBeenCalled();

    // First delta arrives — switches to idle window.
    noteTurnWatchdogProgress("eng-test-1");
    vi.advanceTimersByTime(ROBOTICS_IDLE_DELTA_MS - 1);
    expect(abort).not.toHaveBeenCalled();

    // Idle gap exceeded.
    vi.advanceTimersByTime(1);
    expect(abort).toHaveBeenCalledTimes(1);
    expect(wasTurnWatchdogEmitted("eng-test-1")).toBe(true);
  });

  it("Robotics eng-* fires if no first token within ROBOTICS_FIRST_TOKEN_MS", () => {
    vi.useFakeTimers();
    const abort = vi.fn();
    armTurnWatchdog({
      streamId: "eng-cold",
      mode: "ask",
      stream: { send: () => true },
      abort,
    });
    vi.advanceTimersByTime(ROBOTICS_FIRST_TOKEN_MS - 1);
    expect(abort).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(abort).toHaveBeenCalledTimes(1);
  });

  it("Robotics eng-* hard ceiling is ROBOTICS_TOTAL_TURN_MS", () => {
    vi.useFakeTimers();
    const abort = vi.fn();
    armTurnWatchdog({
      streamId: "eng-hard",
      mode: "ask",
      stream: { send: () => true },
      abort,
    });
    // Keep petting idle — hard timer still wins.
    const step = ROBOTICS_IDLE_DELTA_MS - 1000;
    let elapsed = 0;
    while (elapsed + step < ROBOTICS_TOTAL_TURN_MS) {
      noteTurnWatchdogProgress("eng-hard");
      vi.advanceTimersByTime(step);
      elapsed += step;
      if (abort.mock.calls.length > 0) break;
    }
    if (abort.mock.calls.length === 0) {
      vi.advanceTimersByTime(ROBOTICS_TOTAL_TURN_MS - elapsed + 1);
    }
    expect(abort).toHaveBeenCalled();
    expect(ROBOTICS_FIRST_TOKEN_MS).toBe(90_000);
    expect(ROBOTICS_TOTAL_TURN_MS).toBe(180_000);
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
