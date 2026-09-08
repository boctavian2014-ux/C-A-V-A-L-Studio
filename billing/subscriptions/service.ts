/**
 * Subscription summary + upgrade link resolution (no entitlement enforcement).
 */

import { getPlanLimits } from "../plan-catalog";
import type {
  ActivateSubscriptionInput,
  PlanId,
  RevolutSubscriptionRecord,
  SubscriptionSummary,
  UsageRecord,
} from "../subscription-types";
import {
  activateRevolutSubscription,
  calendarMonthPeriod,
  ensureUsageRecord,
  getRevolutSubscription,
  getUsageRecord,
  resolveEffectivePlan,
} from "./store";

export type UpgradePlanTarget = "pro" | "ultra";

function freePeriodSummary(userId: string, now = new Date()): {
  periodStart: string;
  periodEnd: string;
  usage: UsageRecord;
} {
  const { periodStart, periodEnd } = calendarMonthPeriod(now);
  const usage = ensureUsageRecord(userId, periodStart, periodEnd);
  return { periodStart, periodEnd, usage };
}

export function getSubscriptionSummary(
  userId: string,
  now = new Date(),
  env: NodeJS.ProcessEnv = process.env
): SubscriptionSummary {
  const id = userId.trim() || "anonymous";
  const plan = resolveEffectivePlan(id, now);
  const sub = getRevolutSubscription(id);

  let periodStart: string;
  let periodEnd: string;
  let status: SubscriptionSummary["subscription"]["status"] = "active";
  let usage: UsageRecord;

  if (plan !== "free" && sub) {
    periodStart = sub.currentPeriodStart;
    periodEnd = sub.currentPeriodEnd;
    status = sub.status;
    usage =
      getUsageRecord(id, periodStart) ?? ensureUsageRecord(id, periodStart, periodEnd);
  } else {
    const free = freePeriodSummary(id, now);
    periodStart = free.periodStart;
    periodEnd = free.periodEnd;
    usage = free.usage;
    status = "active";
  }

  const limits = getPlanLimits(plan, env);

  return {
    subscription: {
      plan,
      status,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    },
    limits,
    usage: {
      chatTokensUsed: usage.chatTokensUsed,
      cadJobsUsed: usage.cadJobsUsed,
      zooCostAccrued: usage.zooCostAccrued,
      requestsUsed: usage.requestsUsed,
    },
  };
}

export function activatePlan(input: ActivateSubscriptionInput): RevolutSubscriptionRecord {
  return activateRevolutSubscription(input);
}

export function resolveUpgradePaymentLink(
  plan: UpgradePlanTarget,
  env: NodeJS.ProcessEnv = process.env
): { ok: true; url: string } | { ok: false; error: string } {
  const key = plan === "pro" ? "REVOLUT_PAYMENT_LINK_PRO" : "REVOLUT_PAYMENT_LINK_ULTRA";
  const url = env[key]?.trim();
  if (!url) {
    return { ok: false, error: `${key} is not configured` };
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      return { ok: false, error: `${key} must be an https URL` };
    }
  } catch {
    return { ok: false, error: `${key} is not a valid URL` };
  }
  return { ok: true, url };
}

export function isPlanId(value: unknown): value is PlanId {
  return value === "free" || value === "pro" || value === "ultra";
}

export function isUpgradePlanTarget(value: unknown): value is UpgradePlanTarget {
  return value === "pro" || value === "ultra";
}
