import { describe, expect, it, beforeEach } from "vitest";
import {
  requirePlanEntitlement,
} from "../../billing/middleware/require-plan-entitlement";
import {
  isPlanEntitlementError,
  entitlementDenialIpc,
} from "../../billing/entitlement-errors";
import { activatePlan } from "../../billing/subscriptions/service";
import {
  getRevolutSubscription,
  getUsageRecord,
  resetRevolutSubscriptionsForTests,
} from "../../billing/subscriptions/store";
import { resetConcurrencyTrackerForTests } from "../../billing/metering/concurrency-tracker";
import {
  recordChatUsage,
  reserveCadJob,
  releaseCadReservation,
  reconcileCadReservation,
  reconcileCadReservationLocked,
  withUserUsageLock,
  resetMeteringStateForTests,
  getCadReservation,
} from "../../billing/metering/usage-meter";
import { trackChatStreamStart } from "../../billing/metering/concurrency-tracker";

describe("requirePlanEntitlement + metering", () => {
  beforeEach(() => {
    resetRevolutSubscriptionsForTests();
    resetConcurrencyTrackerForTests();
    resetMeteringStateForTests();
  });

  it("denies ultra model tier on free plan with structured 402 payload", () => {
    try {
      requirePlanEntitlement({
        userId: "u_free",
        action: "chat",
        modelId: "claude-opus-5",
      });
      expect.unreachable();
    } catch (error) {
      expect(isPlanEntitlementError(error)).toBe(true);
      if (isPlanEntitlementError(error)) {
        expect(error.status).toBe(402);
        expect(error.payload.error).toBe("upgrade_required");
        expect(error.payload.reason).toBe("model_tier_not_allowed");
        expect(error.payload.requiredPlan).toBe("ultra");
        expect(error.payload.code).toBe("upgrade_required");
        expect(entitlementDenialIpc(error.payload).code).toBe("upgrade_required");
      }
    }
  });

  it("allows standard model on pro", () => {
    activatePlan({ userId: "u_pro", plan: "pro", activatedAt: "2026-09-08T00:00:00.000Z" });
    const ok = requirePlanEntitlement({
      userId: "u_pro",
      action: "chat",
      modelId: "claude-sonnet-5",
      now: new Date("2026-09-08T12:00:00.000Z"),
    });
    expect(ok.plan).toBe("pro");
  });

  it("records modelUsage idempotently for chat", () => {
    const first = recordChatUsage({
      userId: "u_meter",
      idempotencyKey: "req-1",
      provider: "anthropic",
      model: "claude-haiku-4-5",
      inputTokens: 100,
      outputTokens: 50,
      costAccruedUsd: 0.01,
    });
    expect(first.applied).toBe(true);
    expect(first.usage.chatTokensUsed).toBe(150);
    expect(first.usage.modelUsage[0]?.provider).toBe("anthropic");

    const second = recordChatUsage({
      userId: "u_meter",
      idempotencyKey: "req-1",
      provider: "anthropic",
      model: "claude-haiku-4-5",
      inputTokens: 100,
      outputTokens: 50,
      costAccruedUsd: 0.01,
    });
    expect(second.applied).toBe(false);
    expect(second.usage.chatTokensUsed).toBe(150);
  });

  it("reserves CAD then releases on pre-exec failure without net zoo cost", () => {
    activatePlan({
      userId: "u_cad",
      plan: "ultra",
      activatedAt: "2026-09-08T00:00:00.000Z",
    });
    const reserved = reserveCadJob({
      userId: "u_cad",
      reservationId: "op-1",
      estimatedZooCostUsd: 0.06,
      now: new Date("2026-09-08T12:00:00.000Z"),
    });
    expect(reserved.ok).toBe(true);
    const released = releaseCadReservation({
      reservationId: "op-1",
      reason: "failed_before_exec",
    });
    expect(released.ok).toBe(true);
    const res = getCadReservation("op-1");
    expect(res?.status).toBe("released");
  });

  it("reconciles CAD reservation to actual zoo cost", () => {
    activatePlan({
      userId: "u_zoo",
      plan: "ultra",
      activatedAt: "2026-09-08T00:00:00.000Z",
    });
    reserveCadJob({
      userId: "u_zoo",
      reservationId: "op-2",
      estimatedZooCostUsd: 0.1,
      now: new Date("2026-09-08T12:00:00.000Z"),
    });
    const done = reconcileCadReservation({
      reservationId: "op-2",
      idempotencyKey: "job-2",
      actualProvider: "zoo",
      actualZooCostUsd: 0.04,
      model: "zoo-text-to-cad",
    });
    expect(done.ok).toBe(true);
    expect(done.applied).toBe(true);
  });

  it("withUserUsageLock serializes classic read-yield-write lost updates", async () => {
    let accrued = 0;
    await Promise.all(
      [0, 1, 2, 3, 4].map(() =>
        withUserUsageLock("u_lock", async () => {
          const snap = accrued;
          await new Promise((r) => setTimeout(r, 8));
          accrued = snap + 1;
        })
      )
    );
    expect(accrued).toBe(5);
  });

  it("reconcileCadReservationLocked keeps zooCostAccrued correct under concurrency", async () => {
    activatePlan({
      userId: "u_race",
      plan: "ultra",
      activatedAt: "2026-09-08T00:00:00.000Z",
    });
    const now = new Date("2026-09-08T12:00:00.000Z");
    reserveCadJob({
      userId: "u_race",
      reservationId: "op-a",
      estimatedZooCostUsd: 0.1,
      now,
    });
    reserveCadJob({
      userId: "u_race",
      reservationId: "op-b",
      estimatedZooCostUsd: 0.1,
      now,
    });

    await Promise.all([
      reconcileCadReservationLocked({
        reservationId: "op-a",
        idempotencyKey: "job-a",
        actualProvider: "zoo",
        actualZooCostUsd: 0.05,
        model: "zoo-a",
      }),
      reconcileCadReservationLocked({
        reservationId: "op-b",
        idempotencyKey: "job-b",
        actualProvider: "zoo",
        actualZooCostUsd: 0.08,
        model: "zoo-b",
      }),
    ]);

    const periodStart = getRevolutSubscription("u_race")!.currentPeriodStart;
    const usage = getUsageRecord("u_race", periodStart);
    // Soft-reserved 0.20, then deltas -0.05 and -0.02 → 0.13
    expect(usage?.zooCostAccrued).toBeCloseTo(0.13, 6);
  });

  it("denies when chat concurrency exceeded", () => {
    trackChatStreamStart("u_conc", "s1");
    try {
      requirePlanEntitlement({ userId: "u_conc", action: "chat", modelId: "gpt-4o-mini" });
      expect.unreachable();
    } catch (error) {
      expect(isPlanEntitlementError(error)).toBe(true);
      if (isPlanEntitlementError(error)) {
        expect(error.payload.reason).toBe("plan_concurrency_limit");
      }
    }
  });

  it("denies zoo budget on free (budget 0)", () => {
    try {
      requirePlanEntitlement({
        userId: "u_free_zoo",
        action: "cad_job",
        estimatedZooCostUsd: 0.01,
      });
      expect.unreachable();
    } catch (error) {
      expect(isPlanEntitlementError(error)).toBe(true);
      if (isPlanEntitlementError(error)) {
        expect(error.payload.reason).toBe("monthly_zoo_budget_exhausted");
      }
    }
  });
});
