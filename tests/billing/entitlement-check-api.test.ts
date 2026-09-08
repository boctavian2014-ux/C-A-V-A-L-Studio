import request from "supertest";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createBillingServer } from "../../billing/server";
import { resetSubscriptionsForTests } from "../../billing/subscription-store";
import { resetRevolutSubscriptionsForTests } from "../../billing/subscriptions/store";
import { resetConcurrencyTrackerForTests } from "../../billing/metering/concurrency-tracker";
import { resetMeteringStateForTests } from "../../billing/metering/usage-meter";

describe("entitlement-check HTTP 402", () => {
  const prevApi = process.env.BILLING_API_KEY;

  beforeEach(() => {
    resetSubscriptionsForTests();
    resetRevolutSubscriptionsForTests();
    resetConcurrencyTrackerForTests();
    resetMeteringStateForTests();
    process.env.BILLING_API_KEY = "api-secret";
  });

  afterEach(() => {
    if (prevApi === undefined) delete process.env.BILLING_API_KEY;
    else process.env.BILLING_API_KEY = prevApi;
  });

  it("returns 402 upgrade_required for disallowed model tier", async () => {
    const app = createBillingServer();
    const response = await request(app)
      .post("/api/subscriptions/entitlement-check")
      .set("x-billing-api-key", "api-secret")
      .send({ userId: "caval_x", action: "chat", modelId: "claude-opus-5" });
    expect(response.status).toBe(402);
    expect(response.body.error).toBe("upgrade_required");
    expect(response.body.code).toBe("upgrade_required");
    expect(response.body.reason).toBe("model_tier_not_allowed");
    expect(response.body.requiredPlan).toBe("ultra");
    expect(response.body.resetsAt).toBeTruthy();
    // Runtime JSON shape — not only TS types
    expect(JSON.parse(JSON.stringify(response.body))).toMatchObject({
      error: "upgrade_required",
      code: "upgrade_required",
      reason: "model_tier_not_allowed",
    });
  });

  it("returns ok for allowed fast model", async () => {
    const app = createBillingServer();
    const response = await request(app)
      .post("/api/subscriptions/entitlement-check")
      .set("x-billing-api-key", "api-secret")
      .send({ userId: "caval_y", action: "chat", modelId: "gpt-4o-mini" });
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.plan).toBe("free");
  });
});
