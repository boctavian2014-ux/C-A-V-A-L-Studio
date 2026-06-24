import { describe, expect, it } from "vitest";
import { billingHealthCheck } from "../../billing/health-check";

describe("billingHealthCheck", () => {
  it("reports secret configuration state", () => {
    process.env.REVENUECAT_WEBHOOK_SECRET = "configured";
    const health = billingHealthCheck();
    expect(health.revenueCatSecretConfigured).toBe(true);
    expect(health.ok).toBe(true);
    expect(health.checkedAt).toBeTruthy();
  });
});
