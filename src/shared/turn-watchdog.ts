/**
 * P0.3 — finite per-mode turn watchdog.
 * Timeout must abort the stream and close the activity, not only HTTP.
 *
 * Robotics (eng-* stream ids) uses a longer first-token window + idle gap,
 * because ULTRA system prompts and Auto Frontier cold starts have high TTFT.
 */

export type TurnWatchdogMode = "ask" | "plan" | "code" | "debug" | "agentic";

/** Ask / read-only — 25–30s. */
export const ASK_TURN_TIMEOUT_MS = 28_000;
/** Plan — 45–60s. */
export const PLAN_TURN_TIMEOUT_MS = 52_000;
/** Code / Debug — 90–120s. */
export const CODE_TURN_TIMEOUT_MS = 105_000;
/** Agentic — finite 5–10 min. */
export const AGENTIC_TURN_TIMEOUT_MS = 8 * 60_000;

/** Robotics eng-*: wait for first assistant/reasoning progress (cold TTFT). */
export const ROBOTICS_FIRST_TOKEN_MS = 90_000;
/** Robotics eng-*: max idle gap between deltas. */
export const ROBOTICS_IDLE_DELTA_MS = 18_000;
/** Robotics eng-*: hard ceiling for the whole turn (matches eng stream timeoutMs). */
export const ROBOTICS_TOTAL_TURN_MS = 180_000;

export const TURN_WATCHDOG_USER_MESSAGE =
  "Timpul alocat acestui răspuns s-a încheiat. Trimite din nou dacă vrei să continui.";

export const TURN_WATCHDOG_ABORT_REASON = "timed_out";

const TIMEOUT_BY_MODE: Record<TurnWatchdogMode, number> = {
  ask: ASK_TURN_TIMEOUT_MS,
  plan: PLAN_TURN_TIMEOUT_MS,
  code: CODE_TURN_TIMEOUT_MS,
  debug: CODE_TURN_TIMEOUT_MS,
  agentic: AGENTIC_TURN_TIMEOUT_MS,
};

export function normalizeTurnWatchdogMode(mode: string | undefined): TurnWatchdogMode {
  if (mode === "plan" || mode === "architect") return "plan";
  if (mode === "agentic" || mode === "build" || mode === "release") return "agentic";
  if (mode === "debug") return "debug";
  if (mode === "code") return "code";
  return "ask";
}

export function timeoutMsForAgentMode(mode: string | undefined): number {
  return TIMEOUT_BY_MODE[normalizeTurnWatchdogMode(mode)];
}

/** Robotics planning streams use eng-* ids from engineering-stream. */
export function isRoboticsEngineeringStreamId(streamId: string | undefined): boolean {
  return typeof streamId === "string" && streamId.startsWith("eng-");
}
