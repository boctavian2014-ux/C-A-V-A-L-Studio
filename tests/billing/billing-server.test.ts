import request from "supertest";
import crypto from "node:crypto";
import { describe, expect, it, beforeEach } from "vitest";
import { createBillingServer } from "../../billing/server";
import { resetSubscriptionsForTests } from "../../billing/subscription-store";

describe("billing server", () => {
  beforeEach(() => {
    resetSubscriptionsForTests();
    delete process.env.ENABLE_REVENUECAT_WEBHOOK;
  });

  it("responds to health endpoint", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const app = createBillingServer();
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.stripeConfigured).toBe(true);
    expect(response.body.checkedAt).toBeTruthy();
  });

  it("rejects stripe webhook without signature", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const app = createBillingServer();
    const response = await request(app)
      .post("/webhooks/stripe")
      .set("Content-Type", "application/json")
      .send("{}");
    expect(response.status).toBe(400);
  });

  it("requires admin key for sync", async () => {
    process.env.BILLING_ADMIN_KEY = "admin-secret";
    const app = createBillingServer();
    const unauthorized = await request(app).post("/api/billing/sync");
    expect(unauthorized.status).toBe(401);

    const authorized = await request(app)
      .post("/api/billing/sync")
      .set("x-billing-admin-key", "admin-secret");
    expect(authorized.status).toBe(200);
    expect(authorized.body.ok).toBeDefined();
  });

  it("returns community entitlements for unknown user", async () => {
    process.env.BILLING_API_KEY = "api-secret";
    const app = createBillingServer();
    const response = await request(app)
      .get("/api/billing/entitlements/caval_unknown")
      .set("x-billing-api-key", "api-secret");
    expect(response.status).toBe(200);
    expect(response.body.plan).toBe("community");
  });

  it("rejects revenuecat webhook when legacy flag disabled", async () => {
    process.env.REVENUECAT_WEBHOOK_SECRET = "billing-test-secret";
    const app = createBillingServer();
    const body = JSON.stringify({
      event: { id: "e1", type: "TEST", app_user_id: "u1", event_timestamp_ms: 1 },
    });
    const response = await request(app)
      .post("/webhooks/revenuecat")
      .set("Content-Type", "application/json")
      .send(body);
    expect(response.status).toBe(404);
  });

  it("accepts signed revenuecat webhook when legacy enabled", async () => {
    process.env.REVENUECAT_WEBHOOK_SECRET = "billing-test-secret";
    process.env.ENABLE_REVENUECAT_WEBHOOK = "true";
    const app = createBillingServer();
    const body = JSON.stringify({
      event: { id: "e2", type: "INITIAL_PURCHASE", app_user_id: "u1", event_timestamp_ms: 1 },
    });
    const signature = crypto.createHmac("sha256", "billing-test-secret").update(body).digest("hex");
    const response = await request(app)
      .post("/webhooks/revenuecat")
      .set("Content-Type", "application/json")
      .set("x-revenuecat-signature", signature)
      .send(body);
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });
});
