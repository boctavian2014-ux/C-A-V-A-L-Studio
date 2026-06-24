import crypto from "node:crypto";

export interface RevenueCatWebhookEvent {
  id: string;
  type: string;
  app_user_id: string;
  product_id?: string;
  entitlement_ids?: string[];
  expiration_at_ms?: number;
  event_timestamp_ms: number;
}

export const validateRevenueCatSignature = (
  rawBody: string | Buffer,
  signatureHeader: string | undefined,
  secret = process.env.REVENUECAT_WEBHOOK_SECRET
): boolean => {
  if (!secret) {
    throw new Error("REVENUECAT_WEBHOOK_SECRET is required for webhook validation.");
  }
  if (!signatureHeader) {
    return false;
  }
  const payload = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const provided = signatureHeader.replace(/^sha256=/i, "").trim();
  if (expected.length !== provided.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
};
