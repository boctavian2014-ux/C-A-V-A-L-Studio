import { create } from "zustand";

export type EntitlementDenialReason =
  | "model_tier_not_allowed"
  | "monthly_chat_tokens_exhausted"
  | "monthly_cad_jobs_exhausted"
  | "monthly_zoo_budget_exhausted"
  | "plan_concurrency_limit"
  | "plan_rate_limit";

export type PlanId = "free" | "pro" | "ultra";

export interface UpgradeRequiredNotice {
  reason: EntitlementDenialReason;
  currentPlan: PlanId;
  requiredPlan: PlanId;
  resetsAt: string;
  message?: string;
  source: "chat" | "cad";
  receivedAt: number;
}

interface EntitlementStatusStore {
  notice: UpgradeRequiredNotice | null;
  /** Bumps when a 402 arrives so Settings can refetch usage immediately. */
  usageRefreshEpoch: number;
  noteUpgradeRequired: (notice: Omit<UpgradeRequiredNotice, "receivedAt">) => void;
  clearNotice: () => void;
}

function isPlanId(value: unknown): value is PlanId {
  return value === "free" || value === "pro" || value === "ultra";
}

export function parseUpgradeRequiredPayload(
  raw: Record<string, unknown> | null | undefined,
  source: "chat" | "cad"
): Omit<UpgradeRequiredNotice, "receivedAt"> | null {
  if (!raw || raw.code !== "upgrade_required") return null;
  if (!isPlanId(raw.currentPlan) || !isPlanId(raw.requiredPlan)) return null;
  if (typeof raw.reason !== "string" || typeof raw.resetsAt !== "string") return null;
  return {
    reason: raw.reason as EntitlementDenialReason,
    currentPlan: raw.currentPlan,
    requiredPlan: raw.requiredPlan,
    resetsAt: raw.resetsAt,
    message: typeof raw.error === "string" ? raw.error : undefined,
    source,
  };
}

export const useEntitlementStatusStore = create<EntitlementStatusStore>((set) => ({
  notice: null,
  usageRefreshEpoch: 0,
  noteUpgradeRequired: (notice) =>
    set((state) => ({
      notice: { ...notice, receivedAt: Date.now() },
      usageRefreshEpoch: state.usageRefreshEpoch + 1,
    })),
  clearNotice: () => set({ notice: null }),
}));
