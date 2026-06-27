import { describe, expect, it, beforeEach } from "vitest";
import {
  getSubscription,
  listSubscriptions,
  resetSubscriptionsForTests,
  updateSubscriptionFromRc,
  updateSubscriptionMemory,
} from "../../billing/subscription-store";
import type { MappedBillingEvent } from "../../billing/revenuecat/map-event";

function rcEvent(overrides: Partial<MappedBillingEvent> = {}): MappedBillingEvent {
  return {
    userId: "user_1",
    productId: "pro_monthly",
    entitlements: ["pro"],
    type: "subscription_activated",
    expiresAt: "2026-12-31T00:00:00.000Z",
    ...overrides,
  };
}

describe("subscription-store", () => {
  beforeEach(() => {
    resetSubscriptionsForTests();
  });

  it("maps RevenueCat activation to active pro plan", () => {
    const record = updateSubscriptionFromRc(rcEvent());
    expect(record.status).toBe("active");
    expect(record.plan).toBe("pro");
    expect(getSubscription("user_1")?.entitlements).toEqual(["pro"]);
  });

  it("maps trial and cancellation events", () => {
    updateSubscriptionFromRc(rcEvent({ type: "trial_started", entitlements: [] }));
    expect(getSubscription("user_1")?.status).toBe("trial");
    expect(getSubscription("user_1")?.plan).toBe("community");

    updateSubscriptionFromRc(rcEvent({ type: "subscription_cancelled" }));
    expect(getSubscription("user_1")?.status).toBe("cancelled");
  });

  it("updates memory record and lists all subscriptions", () => {
    updateSubscriptionMemory({
      userId: "user_2",
      productId: "pro_yearly",
      entitlements: ["pro"],
      status: "active",
      plan: "pro",
      expiresAt: null,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(listSubscriptions()).toHaveLength(1);
    expect(getSubscription("user_2")?.productId).toBe("pro_yearly");
  });
});
