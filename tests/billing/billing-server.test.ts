import request from "supertest";
import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { createBillingServer } from "../../billing/server";

describe("billing server", () => {
  it("responds to health endpoint", async () => {
    process.env.REVENUECAT_WEBHOOK_SECRET = "billing-test-secret";
    const app = createBillingServer();
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.revenueCatSecretConfigured).toBe(true);
  });

  it("rejects webhook without signature", async () => {
    process.env.REVENUECAT_WEBHOOK_SECRET = "billing-test-secret";
    const app = createBillingServer();
    const body = JSON.stringify({
      event: { id: "e1", type: "TEST", app_user_id: "u1", event_timestamp_ms: 1 }
    });
    const response = await request(app)
      .post("/webhooks/revenuecat")
      .set("Content-Type", "application/json")
      .send(body);
    expect(response.status).toBe(400);
  });

  it("accepts signed webhook payloads", async () => {
    process.env.REVENUECAT_WEBHOOK_SECRET = "billing-test-secret";
    const app = createBillingServer();
    const body = JSON.stringify({
      event: { id: "e2", type: "INITIAL_PURCHASE", app_user_id: "u1", event_timestamp_ms: 1 }
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
