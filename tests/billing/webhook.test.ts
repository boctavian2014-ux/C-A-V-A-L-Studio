import crypto from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { resetSubscriptionsForTests } from "../../billing/revenuecat/update-subscription";
import { handleRevenueCatWebhook } from "../../billing/revenuecat/webhook";

describe("handleRevenueCatWebhook", () => {
  beforeEach(() => {
    process.env.REVENUECAT_WEBHOOK_SECRET = "webhook-secret";
    resetSubscriptionsForTests();
  });

  it("rejects invalid signatures", () => {
    const body = JSON.stringify({ event: { id: "1", type: "RENEWAL", app_user_id: "u", event_timestamp_ms: 1 } });
    const result = handleRevenueCatWebhook(body, "bad-signature");
    expect(result.ok).toBe(false);
  });

  it("accepts valid webhook and updates subscription", () => {
    const body = JSON.stringify({
      event: {
        id: "1",
        type: "INITIAL_PURCHASE",
        app_user_id: "webhook-user",
        product_id: "pro",
        entitlement_ids: ["pro"],
        event_timestamp_ms: Date.now()
      }
    });
    const signature = crypto.createHmac("sha256", "webhook-secret").update(body).digest("hex");
    const result = handleRevenueCatWebhook(body, signature);
    expect(result.ok).toBe(true);
    expect(result.record?.status).toBe("active");
    expect(result.record?.userId).toBe("webhook-user");
  });

  it("returns error when event payload missing", () => {
    const body = JSON.stringify({});
    const signature = crypto.createHmac("sha256", "webhook-secret").update(body).digest("hex");
    const result = handleRevenueCatWebhook(body, signature);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Missing event");
  });
});
