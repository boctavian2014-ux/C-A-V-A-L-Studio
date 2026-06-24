import { beforeEach, describe, expect, it } from "vitest";
import { getSubscription, resetSubscriptionsForTests, updateSubscription } from "../../billing/revenuecat/update-subscription";

describe("updateSubscription", () => {
  beforeEach(() => resetSubscriptionsForTests());

  it("stores active subscription on renewal", () => {
    const record = updateSubscription({
      type: "subscription_renewed",
      userId: "u-active",
      productId: "pro",
      entitlements: ["pro"],
      rawType: "RENEWAL"
    });
    expect(record.status).toBe("active");
    expect(getSubscription("u-active")?.productId).toBe("pro");
  });

  it("marks cancelled and expired states", () => {
    updateSubscription({ type: "subscription_cancelled", userId: "u1", entitlements: [], rawType: "CANCELLATION" });
    updateSubscription({ type: "subscription_expired", userId: "u2", entitlements: [], rawType: "EXPIRATION" });
    expect(getSubscription("u1")?.status).toBe("cancelled");
    expect(getSubscription("u2")?.status).toBe("expired");
  });

  it("marks trial_started as trial", () => {
    const record = updateSubscription({
      type: "trial_started",
      userId: "trial-user",
      entitlements: ["pro"],
      rawType: "TRIAL_STARTED"
    });
    expect(record.status).toBe("trial");
  });
});
