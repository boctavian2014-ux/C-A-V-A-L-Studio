/**
 * Development PlanCatalog — configurable via env; no launch prices.
 * Tests should inject fixtures rather than reading production env.
 */

import type { PlanId, PlanLimits, ModelTier } from "./subscription-types";

const ALL_TIERS: ModelTier[] = ["fast", "standard", "ultra"];

/** Dev defaults — not product pricing. Override with PLAN_* env vars. */
export const DEFAULT_PLAN_CATALOG: Record<PlanId, PlanLimits> = {
  free: {
    chatTokens: 50_000,
    cadJobs: 3,
    zooBudgetUsd: 0,
    allowedModelTiers: ["fast"],
  },
  pro: {
    chatTokens: 500_000,
    cadJobs: 30,
    zooBudgetUsd: 5,
    allowedModelTiers: ["fast", "standard"],
  },
  ultra: {
    chatTokens: 2_000_000,
    cadJobs: 100,
    zooBudgetUsd: 25,
    allowedModelTiers: ALL_TIERS,
  },
};

export function getPlanCatalog(env: NodeJS.ProcessEnv = process.env): Record<PlanId, PlanLimits> {
  const parseIntSafe = (name: string, fallback: number): number => {
    const raw = env[name];
    if (raw == null || raw.trim() === "") return fallback;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
  };
  const parseFloatSafe = (name: string, fallback: number): number => {
    const raw = env[name];
    if (raw == null || raw.trim() === "") return fallback;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  const parseTiersSafe = (name: string, fallback: ModelTier[]): ModelTier[] => {
    const raw = env[name];
    if (!raw?.trim()) return [...fallback];
    const parts = raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s): s is ModelTier => s === "fast" || s === "standard" || s === "ultra");
    return parts.length > 0 ? parts : [...fallback];
  };

  return {
    free: {
      chatTokens: parseIntSafe("PLAN_FREE_CHAT_TOKENS", DEFAULT_PLAN_CATALOG.free.chatTokens),
      cadJobs: parseIntSafe("PLAN_FREE_CAD_JOBS", DEFAULT_PLAN_CATALOG.free.cadJobs),
      zooBudgetUsd: parseFloatSafe("PLAN_FREE_ZOO_BUDGET_USD", DEFAULT_PLAN_CATALOG.free.zooBudgetUsd),
      allowedModelTiers: parseTiersSafe(
        "PLAN_FREE_ALLOWED_TIERS",
        DEFAULT_PLAN_CATALOG.free.allowedModelTiers
      ),
    },
    pro: {
      chatTokens: parseIntSafe("PLAN_PRO_CHAT_TOKENS", DEFAULT_PLAN_CATALOG.pro.chatTokens),
      cadJobs: parseIntSafe("PLAN_PRO_CAD_JOBS", DEFAULT_PLAN_CATALOG.pro.cadJobs),
      zooBudgetUsd: parseFloatSafe("PLAN_PRO_ZOO_BUDGET_USD", DEFAULT_PLAN_CATALOG.pro.zooBudgetUsd),
      allowedModelTiers: parseTiersSafe(
        "PLAN_PRO_ALLOWED_TIERS",
        DEFAULT_PLAN_CATALOG.pro.allowedModelTiers
      ),
    },
    ultra: {
      chatTokens: parseIntSafe("PLAN_ULTRA_CHAT_TOKENS", DEFAULT_PLAN_CATALOG.ultra.chatTokens),
      cadJobs: parseIntSafe("PLAN_ULTRA_CAD_JOBS", DEFAULT_PLAN_CATALOG.ultra.cadJobs),
      zooBudgetUsd: parseFloatSafe(
        "PLAN_ULTRA_ZOO_BUDGET_USD",
        DEFAULT_PLAN_CATALOG.ultra.zooBudgetUsd
      ),
      allowedModelTiers: parseTiersSafe(
        "PLAN_ULTRA_ALLOWED_TIERS",
        DEFAULT_PLAN_CATALOG.ultra.allowedModelTiers
      ),
    },
  };
}

export function getPlanLimits(plan: PlanId, env: NodeJS.ProcessEnv = process.env): PlanLimits {
  return getPlanCatalog(env)[plan];
}
