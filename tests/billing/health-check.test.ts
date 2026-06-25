import { describe, expect, it } from "vitest";
import { billingHealthCheck } from "../../billing/health-check";

describe("billingHealthCheck", () => {
  it("reports secret configuration state", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const health = await billingHealthCheck();
    expect(health.stripeConfigured).toBe(true);
    expect(health.ok).toBe(true);
    expect(health.checkedAt).toBeTruthy();
  });
});
