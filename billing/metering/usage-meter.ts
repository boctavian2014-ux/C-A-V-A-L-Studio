/**
 * Idempotent usage mutations + CAD reservations (in-memory PR2).
 *
 * All zooCostAccrued / cadJobsUsed updates go through mutateUsage under a
 * per-user lock so concurrent jobs cannot lost-update the same period row.
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

/** Per-user async mutex tail — serializes mutateUsage across await boundaries. */
const usageLockTails = new Map<string, Promise<void>>();
/** Reentrant sync depth so nested mutateUsage on the same stack is allowed. */
const usageLockDepth = new Map<string, number>();

export function resetMeteringStateForTests(): void {
  idempotencyKeys.clear();
  cadReservations.clear();
  usageLockTails.clear();
  usageLockDepth.clear();
}

function normalizeUserId(userId: string): string {
  return userId.trim() || "anonymous";
}

/**
 * Serialize work that reads/writes the same user's usage row.
 * Sync callers use the reentrant depth path; async callers chain on the tail.
 */
export async function withUserUsageLock<T>(
  userId: string,
  fn: () => T | Promise<T>
): Promise<T> {
  const id = normalizeUserId(userId);
  const prev = usageLockTails.get(id) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const linked = prev.then(() => gate);
  usageLockTails.set(
    id,
    linked.then(
      () => undefined,
      () => undefined
    )
  );
  await prev;
  usageLockDepth.set(id, (usageLockDepth.get(id) ?? 0) + 1);
  try {
    return await fn();
  } finally {
    const depth = (usageLockDepth.get(id) ?? 1) - 1;
    if (depth <= 0) usageLockDepth.delete(id);
    else usageLockDepth.set(id, depth);
    release();
  }
}

function activeUsage(userId: string, now = new Date()): UsageRecord {
  const id = normalizeUserId(userId);
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

/**
 * Atomic in-place update of the live UsageRecord for this user.
 * Never clone-then-write: mutator receives the shared store object.
 */
function mutateUsage(userId: string, mutator: (u: UsageRecord) => void, now = new Date()): UsageRecord {
  const id = normalizeUserId(userId);
  const enter = () => {
    usageLockDepth.set(id, (usageLockDepth.get(id) ?? 0) + 1);
  };
  const leave = () => {
    const depth = (usageLockDepth.get(id) ?? 1) - 1;
    if (depth <= 0) usageLockDepth.delete(id);
    else usageLockDepth.set(id, depth);
  };

  // Sync path: Node cannot interleave two sync mutators on the same stack.
  // Depth tracks nesting; async withUserUsageLock awaits before entering.
  enter();
  try {
    const usage = activeUsage(id, now);
    mutator(usage);
    return usage;
  } finally {
    leave();
  }
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
    userId: normalizeUserId(input.userId),
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

  // Single atomic update: adjust accrued by delta (not read-clone-write).
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

/**
 * Locked variants — hold the per-user mutex across the full check + mutate
 * so concurrent CAD jobs cannot interleave zooCostAccrued updates.
 */
export async function reserveCadJobLocked(
  input: Parameters<typeof reserveCadJob>[0]
): Promise<ReturnType<typeof reserveCadJob>> {
  return withUserUsageLock(input.userId, () => reserveCadJob(input));
}

export async function releaseCadReservationLocked(
  input: Parameters<typeof releaseCadReservation>[0]
): Promise<ReturnType<typeof releaseCadReservation>> {
  const res = cadReservations.get(input.reservationId);
  if (!res) return { ok: false };
  return withUserUsageLock(res.userId, () => releaseCadReservation(input));
}

export async function reconcileCadReservationLocked(
  input: Parameters<typeof reconcileCadReservation>[0]
): Promise<{ ok: boolean; applied: boolean }> {
  const res = cadReservations.get(input.reservationId);
  if (!res) return { ok: false, applied: false };
  return withUserUsageLock(res.userId, () => reconcileCadReservation(input));
}

export function getCadReservation(reservationId: string) {
  return cadReservations.get(reservationId);
}
