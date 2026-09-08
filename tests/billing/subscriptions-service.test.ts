import { describe, expect, it, beforeEach } from "vitest";
import {
  activatePlan,
  getSubscriptionSummary,
  resolveUpgradePaymentLink,
} from "../../billing/subscriptions/service";
import {
  ensureUsageRecord,
  getUsageRecord,
  resetRevolutSubscriptionsForTests,
} from "../../billing/subscriptions/store";

describe("subscriptions service", () => {
  beforeEach(() => {
    resetRevolutSubscriptionsForTests();
  });

  it("returns free plan with zero usage and empty modelUsage schema path", () => {
    const summary = getSubscriptionSummary("caval_test_free");
    expect(summary.subscription.plan).toBe("free");
    expect(summary.usage.chatTokensUsed).toBe(0);
    expect(summary.usage.cadJobsUsed).toBe(0);
    expect(summary.usage.requestsUsed).toBe(0);
    expect(summary.usage.zooCostAccrued).toBe(0);
    expect(summary.limits.allowedModelTiers).toContain("fast");

    const usage = getUsageRecord(
      "caval_test_free",
      summary.subscription.currentPeriodStart
    );
    expect(usage?.modelUsage).toEqual([]);
  });

  it("activates pro with period fields and billingMode", () => {
    const activatedAt = "2026-09-08T12:00:00.000Z";
    const record = activatePlan({
      userId: "caval_pro_user",
      plan: "pro",
      revolutPaymentReference: "rv_ref_1",
      activatedAt,
      periodDays: 30,
    });
    expect(record.billingMode).toBe("manual_payment_link");
    expect(record.currentPeriodStart).toBe(activatedAt);
    expect(record.currentPeriodEnd).toBe("2026-10-08T12:00:00.000Z");
    expect(record.revolutPaymentReference).toBe("rv_ref_1");

    const summary = getSubscriptionSummary("caval_pro_user", new Date(activatedAt));
    expect(summary.subscription.plan).toBe("pro");
    expect(summary.subscription.currentPeriodEnd).toBe(record.currentPeriodEnd);
    expect(summary.limits.allowedModelTiers).toContain("standard");

    const usage = ensureUsageRecord(
      "caval_pro_user",
      record.currentPeriodStart,
      record.currentPeriodEnd
    );
    expect(usage.modelUsage).toEqual([]);
  });

  it("rejects duplicate revolutPaymentReference across users", () => {
    activatePlan({
      userId: "u1",
      plan: "pro",
      revolutPaymentReference: "same_ref",
    });
    expect(() =>
      activatePlan({
        userId: "u2",
        plan: "ultra",
        revolutPaymentReference: "same_ref",
      })
    ).toThrow(/already used/);
  });

  it("resolves upgrade payment links from env", () => {
    const missing = resolveUpgradePaymentLink("pro", {} as NodeJS.ProcessEnv);
    expect(missing.ok).toBe(false);

    const ok = resolveUpgradePaymentLink("ultra", {
      REVOLUT_PAYMENT_LINK_ULTRA: "https://checkout.revolut.com/pay/test-ultra",
    } as NodeJS.ProcessEnv);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.url).toContain("checkout.revolut.com");
  });
});
