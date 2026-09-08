import { describe, expect, it, beforeEach } from "vitest";
import {
  requirePlanEntitlement,
} from "../../billing/middleware/require-plan-entitlement";
import {
  isPlanEntitlementError,
  entitlementDenialIpc,
} from "../../billing/entitlement-errors";
import { activatePlan } from "../../billing/subscriptions/service";
import { resetRevolutSubscriptionsForTests } from "../../billing/subscriptions/store";
import { resetConcurrencyTrackerForTests } from "../../billing/metering/concurrency-tracker";
import {
  recordChatUsage,
  reserveCadJob,
  releaseCadReservation,
  reconcileCadReservation,
  resetMeteringStateForTests,
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
