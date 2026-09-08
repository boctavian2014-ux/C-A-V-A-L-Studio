import request from "supertest";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createBillingServer } from "../../billing/server";
import { resetSubscriptionsForTests } from "../../billing/subscription-store";
import { resetRevolutSubscriptionsForTests } from "../../billing/subscriptions/store";

describe("subscriptions HTTP API", () => {
  const prevApi = process.env.BILLING_API_KEY;
  const prevAdmin = process.env.BILLING_ADMIN_KEY;
  const prevPro = process.env.REVOLUT_PAYMENT_LINK_PRO;

  beforeEach(() => {
    resetSubscriptionsForTests();
    resetRevolutSubscriptionsForTests();
    process.env.BILLING_API_KEY = "api-secret";
    process.env.BILLING_ADMIN_KEY = "admin-secret";
    process.env.REVOLUT_PAYMENT_LINK_PRO = "https://checkout.revolut.com/pay/pro-test";
    delete process.env.ENABLE_REVENUECAT_WEBHOOK;
  });

  afterEach(() => {
    if (prevApi === undefined) delete process.env.BILLING_API_KEY;
    else process.env.BILLING_API_KEY = prevApi;
    if (prevAdmin === undefined) delete process.env.BILLING_ADMIN_KEY;
    else process.env.BILLING_ADMIN_KEY = prevAdmin;
    if (prevPro === undefined) delete process.env.REVOLUT_PAYMENT_LINK_PRO;
    else process.env.REVOLUT_PAYMENT_LINK_PRO = prevPro;
  });

  it("GET /api/subscriptions/me returns free defaults for unknown user", async () => {
    const app = createBillingServer();
    const response = await request(app)
      .get("/api/subscriptions/me")
      .query({ userId: "caval_unknown" })
      .set("x-billing-api-key", "api-secret");
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.subscription.plan).toBe("free");
    expect(response.body.usage.chatTokensUsed).toBe(0);
    expect(response.body.modelUsage).toEqual([]);
    expect(response.body.managedProvidersConfigured).toBeTruthy();
    expect(JSON.stringify(response.body)).not.toMatch(/sk-|api[_-]?key\":\s*\"[^"]+/i);
  });

  it("activates pro then reflects in /me", async () => {
    const app = createBillingServer();
    const activate = await request(app)
      .post("/api/subscriptions/activate")
      .set("x-billing-admin-key", "admin-secret")
      .send({
        userId: "caval_http_pro",
        plan: "pro",
        revolutPaymentReference: "rv_http_1",
        periodDays: 30,
      });
    expect(activate.status).toBe(200);
    expect(activate.body.subscription.billingMode).toBe("manual_payment_link");

    const me = await request(app)
      .get("/api/subscriptions/me")
      .query({ userId: "caval_http_pro" })
      .set("x-billing-api-key", "api-secret");
    expect(me.status).toBe(200);
    expect(me.body.subscription.plan).toBe("pro");
    expect(me.body.subscription.currentPeriodEnd).toBeTruthy();
    expect(me.body.modelUsage).toEqual([]);
  });

  it("returns configured upgrade link", async () => {
    const app = createBillingServer();
    const response = await request(app)
      .get("/api/subscriptions/upgrade-link/pro")
      .set("x-billing-api-key", "api-secret");
    expect(response.status).toBe(200);
    expect(response.body.url).toBe("https://checkout.revolut.com/pay/pro-test");
  });
});
