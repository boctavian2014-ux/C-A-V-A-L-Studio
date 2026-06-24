import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { validateRevenueCatSignature } from "./validate-signature";

describe("validateRevenueCatSignature", () => {
  it("accepts valid sha256 signatures", () => {
    process.env.REVENUECAT_WEBHOOK_SECRET = "test-secret";
    const body = JSON.stringify({ event: { id: "1", type: "RENEWAL", app_user_id: "u1", event_timestamp_ms: 1 } });
    const signature = crypto.createHmac("sha256", "test-secret").update(body).digest("hex");
    expect(validateRevenueCatSignature(body, signature)).toBe(true);
  });

  it("rejects invalid signatures", () => {
    process.env.REVENUECAT_WEBHOOK_SECRET = "test-secret";
    expect(validateRevenueCatSignature("{}", "bad-signature")).toBe(false);
  });
});
