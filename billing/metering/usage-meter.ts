/**
 * Idempotent usage mutations + CAD reservations (in-memory PR2).
 */

import type { MeteredProviderId, ModelUsageEntry, UsageRecord } from "../subscription-types";
import {
  calendarMonthPeriod,
  ensureUsageRecord,
  getRevolutSubscription,
  getUsageRecord,
  resolveEffectivePlan,
} from "../subscriptions/store";
import {
  trackCadReservationEnd,
  trackCadReservationStart,
} from "./concurrency-tracker";

const idempotencyKeys = new Set<string>();
const cadReservations = new Map<
  string,
  {
    userId: string;
    periodStart: string;
    reservedZooUsd: number;
    reservedCadJob: boolean;
    status: "reserved" | "committed" | "released";
  }
>();

export function resetMeteringStateForTests(): void {
  idempotencyKeys.clear();
  cadReservations.clear();
}

function activeUsage(userId: string, now = new Date()): UsageRecord {
  const id = userId.trim() || "anonymous";
  const plan = resolveEffectivePlan(id, now);
  const sub = getRevolutSubscription(id);
  if (plan !== "free" && sub) {
    return (
      getUsageRecord(id, sub.currentPeriodStart) ??
      ensureUsageRecord(id, sub.currentPeriodStart, sub.currentPeriodEnd)
    );
  }
  const { periodStart, periodEnd } = calendarMonthPeriod(now);
  return ensureUsageRecord(id, periodStart, periodEnd);
}

function mutateUsage(userId: string, mutator: (u: UsageRecord) => void, now = new Date()): UsageRecord {
  const usage = activeUsage(userId, now);
  mutator(usage);
  return usage;
}

export function recordChatUsage(input: {
  userId: string;
  idempotencyKey: string;
  provider: MeteredProviderId;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costAccruedUsd?: number;
  now?: Date;
}): { applied: boolean; usage: UsageRecord } {
  const key = `chat:${input.idempotencyKey}`;
  const usage = activeUsage(input.userId, input.now);
  if (idempotencyKeys.has(key)) {
    return { applied: false, usage };
  }
  idempotencyKeys.add(key);

  const inTok = Math.max(0, Math.floor(input.inputTokens));
  const outTok = Math.max(0, Math.floor(input.outputTokens));
  const cost = Math.max(0, input.costAccruedUsd ?? 0);

  mutateUsage(
    input.userId,
    (u) => {
      u.requestsUsed += 1;
      u.chatTokensUsed += inTok + outTok;
      const entry: ModelUsageEntry = {
        provider: input.provider,
        model: input.model,
        inputTokens: inTok,
        outputTokens: outTok,
        costAccruedUsd: cost,
      };
      const existing = u.modelUsage.find(
        (m) => m.provider === entry.provider && m.model === entry.model
      );
      if (existing) {
        existing.inputTokens += entry.inputTokens;
        existing.outputTokens += entry.outputTokens;
        existing.costAccruedUsd += entry.costAccruedUsd;
      } else {
        u.modelUsage.push(entry);
      }
    },
    input.now
  );

  return { applied: true, usage: activeUsage(input.userId, input.now) };
}

export function reserveCadJob(input: {
  userId: string;
  reservationId: string;
  estimatedZooCostUsd?: number;
  now?: Date;
}): { ok: true; reservationId: string } | { ok: false; error: string } {
  if (cadReservations.has(input.reservationId)) {
    return { ok: false, error: "reservation already exists" };
  }
  const estimated = Math.max(0, input.estimatedZooCostUsd ?? 0);
  const usage = activeUsage(input.userId, input.now);

  // Soft reserve zoo budget on the usage row until reconcile/release.
  mutateUsage(
    input.userId,
    (u) => {
      u.cadJobsUsed += 1;
      u.zooCostAccrued += estimated;
      u.requestsUsed += 1;
    },
    input.now
  );

  cadReservations.set(input.reservationId, {
    userId: input.userId.trim() || "anonymous",
    periodStart: usage.periodStart,
    reservedZooUsd: estimated,
    reservedCadJob: true,
    status: "reserved",
  });
  trackCadReservationStart(input.userId, input.reservationId);
  return { ok: true, reservationId: input.reservationId };
}

export function releaseCadReservation(input: {
  reservationId: string;
  reason: "failed_before_exec" | "aborted";
}): { ok: boolean } {
  const res = cadReservations.get(input.reservationId);
  if (!res || res.status !== "reserved") return { ok: false };

  mutateUsage(res.userId, (u) => {
    if (res.reservedCadJob) u.cadJobsUsed = Math.max(0, u.cadJobsUsed - 1);
    u.zooCostAccrued = Math.max(0, u.zooCostAccrued - res.reservedZooUsd);
  });
  res.status = "released";
  trackCadReservationEnd(res.userId, input.reservationId);
  return { ok: true };
}

export function reconcileCadReservation(input: {
  reservationId: string;
  idempotencyKey: string;
  actualProvider: MeteredProviderId;
  actualZooCostUsd: number;
  model?: string;
}): { ok: boolean; applied: boolean } {
  const key = `cad:${input.idempotencyKey}`;
  const res = cadReservations.get(input.reservationId);
  if (!res) return { ok: false, applied: false };
  if (idempotencyKeys.has(key)) return { ok: true, applied: false };
  if (res.status !== "reserved") return { ok: false, applied: false };

  idempotencyKeys.add(key);
  const actual = Math.max(0, input.actualZooCostUsd);
  const delta = actual - res.reservedZooUsd;

  mutateUsage(res.userId, (u) => {
    u.zooCostAccrued = Math.max(0, u.zooCostAccrued + delta);
    const model = input.model ?? `${input.actualProvider}-job`;
    const existing = u.modelUsage.find(
      (m) => m.provider === input.actualProvider && m.model === model
    );
    if (existing) {
      existing.costAccruedUsd += actual;
    } else {
      u.modelUsage.push({
        provider: input.actualProvider,
        model,
        inputTokens: 0,
        outputTokens: 0,
        costAccruedUsd: actual,
      });
    }
  });

  res.status = "committed";
  res.reservedZooUsd = actual;
  trackCadReservationEnd(res.userId, input.reservationId);
  return { ok: true, applied: true };
}

export function getCadReservation(reservationId: string) {
  return cadReservations.get(reservationId);
}
