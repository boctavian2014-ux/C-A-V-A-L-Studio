/**
 * In-memory Revolut subscription + usage store (PR1 foundation).
 * Supabase schema exists in migration 008; service role wiring can follow.
 */

import type {
  ActivateSubscriptionInput,
  PlanId,
  RevolutSubscriptionRecord,
  UsageRecord,
} from "../subscription-types";

const subscriptions = new Map<string, RevolutSubscriptionRecord>();
const usageByUserPeriod = new Map<string, UsageRecord>();
const paymentRefs = new Map<string, string>();

function usageKey(userId: string, periodStart: string): string {
  return `${userId}::${periodStart}`;
}

export function resetRevolutSubscriptionsForTests(): void {
  subscriptions.clear();
  usageByUserPeriod.clear();
  paymentRefs.clear();
}

export function getRevolutSubscription(userId: string): RevolutSubscriptionRecord | undefined {
  return subscriptions.get(userId);
}

export function listRevolutSubscriptions(): RevolutSubscriptionRecord[] {
  return [...subscriptions.values()];
}

export function getUsageRecord(userId: string, periodStart: string): UsageRecord | undefined {
  return usageByUserPeriod.get(usageKey(userId, periodStart));
}

function emptyUsage(userId: string, periodStart: string, periodEnd: string): UsageRecord {
  return {
    userId,
    periodStart,
    periodEnd,
    requestsUsed: 0,
    cadJobsUsed: 0,
    zooCostAccrued: 0,
    chatTokensUsed: 0,
    modelUsage: [],
  };
}

export function ensureUsageRecord(
  userId: string,
  periodStart: string,
  periodEnd: string
): UsageRecord {
  const key = usageKey(userId, periodStart);
  const existing = usageByUserPeriod.get(key);
  if (existing) return existing;
  const created = emptyUsage(userId, periodStart, periodEnd);
  usageByUserPeriod.set(key, created);
  return created;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

export function activateRevolutSubscription(
  input: ActivateSubscriptionInput
): RevolutSubscriptionRecord {
  const plan = input.plan;
  if (plan !== "pro" && plan !== "ultra") {
    throw new Error(`Invalid plan for activation: ${String(plan)}`);
  }
  const userId = input.userId.trim();
  if (!userId) throw new Error("userId is required");

  const ref = input.revolutPaymentReference?.trim();
  if (ref) {
    const existingOwner = paymentRefs.get(ref);
    if (existingOwner && existingOwner !== userId) {
      throw new Error(`revolutPaymentReference already used by another user`);
    }
    const existing = subscriptions.get(userId);
    if (
      existing &&
      existingOwner === userId &&
      existing.revolutPaymentReference === ref &&
      existing.status === "active"
    ) {
      // Same user + same payment ref: idempotent only when plan matches.
      if (existing.plan !== plan) {
        throw new Error(
          `revolutPaymentReference already activates plan "${existing.plan}"; cannot re-activate as "${plan}"`
        );
      }
      return existing;
    }
  }

  const activatedAt = input.activatedAt ?? new Date().toISOString();
  const periodDays = input.periodDays ?? 30;
  const currentPeriodStart = activatedAt;
  const currentPeriodEnd = addDaysIso(activatedAt, periodDays);

  const record: RevolutSubscriptionRecord = {
    userId,
    plan,
    status: "active",
    currentPeriodStart,
    currentPeriodEnd,
    activatedAt,
    billingMode: "manual_payment_link",
    revolutPaymentReference: ref || undefined,
    updatedAt: new Date().toISOString(),
  };

  subscriptions.set(userId, record);
  if (ref) paymentRefs.set(ref, userId);
  ensureUsageRecord(userId, currentPeriodStart, currentPeriodEnd);
  return record;
}

export function calendarMonthPeriod(now = new Date()): {
  periodStart: string;
  periodEnd: string;
} {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return { periodStart: start.toISOString(), periodEnd: end.toISOString() };
}

export function resolveEffectivePlan(userId: string, now = new Date()): PlanId {
  const sub = subscriptions.get(userId);
  if (!sub || sub.status !== "active") return "free";
  if (new Date(sub.currentPeriodEnd).getTime() <= now.getTime()) return "free";
  return sub.plan;
}
