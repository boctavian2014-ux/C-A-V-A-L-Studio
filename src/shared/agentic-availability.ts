/** IPC contract for Agentic cloud availability. Boolean only — never env or keys. */

export const AGENTIC_AVAILABILITY_CHANNEL =
  "caval:build-mode-get-agentic-availability" as const;

export type AgenticAvailabilityResponse =
  | { ok: true; available: boolean }
  | { ok: false; available: false; error?: string };
