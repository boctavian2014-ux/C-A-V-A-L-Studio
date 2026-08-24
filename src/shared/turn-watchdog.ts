/**
 * P0.3 — finite per-mode turn watchdog.
 * Timeout must abort the stream and close the activity, not only HTTP.
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
