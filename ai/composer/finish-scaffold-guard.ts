import type { FinishDiskWritePlan } from "./finish-disk-write-gate";

/**
 * Unified-diff preview must not cancel fence writes on a granted turn.
 * SCAFFOLD / applyParsedFences always continue to applyScaffoldToWorkspace.
 */
export function shouldBlockScaffoldApplyOnDiff(
  plan: Pick<FinishDiskWritePlan, "applyParsedFences" | "applyFallbackScaffold" | "timeoutRecovery">,
  hasDiff: boolean
): boolean {
  if (!hasDiff || plan.timeoutRecovery) return false;
  if (plan.applyParsedFences || plan.applyFallbackScaffold) return false;
  return true;
}
