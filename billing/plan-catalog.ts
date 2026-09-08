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
    maxConcurrentChatStreams: 1,
    maxConcurrentCadJobs: 1,
  },
  pro: {
    chatTokens: 500_000,
    cadJobs: 30,
    zooBudgetUsd: 5,
    allowedModelTiers: ["fast", "standard"],
    maxConcurrentChatStreams: 3,
    maxConcurrentCadJobs: 2,
  },
  ultra: {
    chatTokens: 2_000_000,
    cadJobs: 100,
    zooBudgetUsd: 25,
    allowedModelTiers: ALL_TIERS,
    maxConcurrentChatStreams: 8,
    maxConcurrentCadJobs: 4,
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

  const base = (plan: PlanId): PlanLimits => {
    const d = DEFAULT_PLAN_CATALOG[plan];
    const prefix =
      plan === "free" ? "PLAN_FREE" : plan === "pro" ? "PLAN_PRO" : "PLAN_ULTRA";
    return {
      chatTokens: parseIntSafe(`${prefix}_CHAT_TOKENS`, d.chatTokens),
      cadJobs: parseIntSafe(`${prefix}_CAD_JOBS`, d.cadJobs),
      zooBudgetUsd: parseFloatSafe(`${prefix}_ZOO_BUDGET_USD`, d.zooBudgetUsd),
      allowedModelTiers: parseTiersSafe(`${prefix}_ALLOWED_TIERS`, d.allowedModelTiers),
      maxConcurrentChatStreams: parseIntSafe(
        `${prefix}_MAX_CHAT_STREAMS`,
        d.maxConcurrentChatStreams
      ),
      maxConcurrentCadJobs: parseIntSafe(`${prefix}_MAX_CAD_JOBS`, d.maxConcurrentCadJobs),
    };
  };

  return {
    free: base("free"),
    pro: base("pro"),
    ultra: base("ultra"),
  };
}

export function getPlanLimits(plan: PlanId, env: NodeJS.ProcessEnv = process.env): PlanLimits {
  return getPlanCatalog(env)[plan];
}
