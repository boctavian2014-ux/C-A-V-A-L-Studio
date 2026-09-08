/**
 * Structured entitlement denial — HTTP 402 and Electron IPC share this shape.
 * 402 is non-standard; clients must handle `code` explicitly (not only status).
 */

import type { ModelTier, PlanId } from "./subscription-types";

export type EntitlementDenialReason =
  | "model_tier_not_allowed"
  | "monthly_chat_tokens_exhausted"
  | "monthly_cad_jobs_exhausted"
  | "monthly_zoo_budget_exhausted"
  | "plan_concurrency_limit"
  | "plan_rate_limit";

export type EntitlementErrorCode = "upgrade_required" | "quota_exceeded" | "plan_limit";

export interface UpgradeRequiredPayload {
  error: "upgrade_required";
  code: EntitlementErrorCode;
  reason: EntitlementDenialReason;
  currentPlan: PlanId;
  requiredPlan: PlanId;
  resetsAt: string;
  /** Optional human message for UI (no secrets). */
  message?: string;
  details?: {
    modelId?: string;
    modelTier?: ModelTier;
    limit?: number;
    used?: number;
  };
}

export class PlanEntitlementError extends Error {
  readonly status = 402;
  readonly payload: UpgradeRequiredPayload;

  constructor(payload: UpgradeRequiredPayload) {
    super(payload.message ?? payload.error);
    this.name = "PlanEntitlementError";
    this.payload = payload;
  }
}

export function isPlanEntitlementError(error: unknown): error is PlanEntitlementError {
  return error instanceof PlanEntitlementError;
}

/** IPC / stream-safe denial (mirrors rate_limited_local shape). */
export function entitlementDenialIpc(payload: UpgradeRequiredPayload): {
  ok: false;
  error: string;
  code: "upgrade_required";
  currentPlan: PlanId;
  requiredPlan: PlanId;
  reason: EntitlementDenialReason;
  resetsAt: string;
  details?: UpgradeRequiredPayload["details"];
} {
  return {
    ok: false,
    error: payload.message ?? "upgrade_required",
    code: "upgrade_required",
    currentPlan: payload.currentPlan,
    requiredPlan: payload.requiredPlan,
    reason: payload.reason,
    resetsAt: payload.resetsAt,
    details: payload.details,
  };
}

export function nextPlanForTier(tier: ModelTier, current: PlanId): PlanId {
  if (tier === "ultra") return "ultra";
  if (tier === "standard") return current === "ultra" ? "ultra" : "pro";
  return current;
}

export function nextPlanForQuota(current: PlanId): PlanId {
  if (current === "free") return "pro";
  if (current === "pro") return "ultra";
  return "ultra";
}
