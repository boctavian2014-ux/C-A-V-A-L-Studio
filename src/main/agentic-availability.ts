import { hasAgenticCloudProvider } from "../../ai/models/agentic-routing-policy";
import type { AgenticAvailabilityResponse } from "../shared/agentic-availability";

/** Main-process only. Reuses fallback credential checks; does not expose env. */
export function readAgenticCloudAvailability(): AgenticAvailabilityResponse {
  try {
    return { ok: true, available: hasAgenticCloudProvider() };
  } catch {
    return { ok: false, available: false };
  }
}

export function toDeniedAgenticAvailability(error: unknown): AgenticAvailabilityResponse {
  return {
    ok: false,
    available: false,
    error: error instanceof Error ? error.message : String(error),
  };
}
