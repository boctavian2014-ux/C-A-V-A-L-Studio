import type { MappedBillingEvent } from "./map-event";
import { mapRevenueCatEvent } from "./map-event";
import type { RevenueCatWebhookEvent } from "./validate-signature";
import { validateRevenueCatSignature } from "./validate-signature";
import { updateSubscription } from "./update-subscription";
import { UniversalRetryQueue } from "../retry-queue";

const webhookRetryQueue = new UniversalRetryQueue(async (job) => {
  updateSubscription(job.payload as MappedBillingEvent);
});

export const handleRevenueCatWebhook = (
  rawBody: string | Buffer,
  signatureHeader: string | undefined
): { ok: boolean; record?: ReturnType<typeof updateSubscription>; error?: string } => {
  try {
    if (!validateRevenueCatSignature(rawBody, signatureHeader)) {
      return { ok: false, error: "Invalid webhook signature." };
    }
    const parsed = JSON.parse(typeof rawBody === "string" ? rawBody : rawBody.toString("utf8")) as {
      event?: RevenueCatWebhookEvent;
    };
    if (!parsed.event) {
      return { ok: false, error: "Missing event payload." };
    }
    const mapped = mapRevenueCatEvent(parsed.event);
    const record = updateSubscription(mapped);
    return { ok: true, record };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      const fallback = JSON.parse(typeof rawBody === "string" ? rawBody : rawBody.toString("utf8")) as {
        event?: RevenueCatWebhookEvent;
      };
      if (fallback.event) {
        webhookRetryQueue.enqueue("revenuecat.webhook", mapRevenueCatEvent(fallback.event));
      }
    } catch {
      // ignore parse errors on retry enqueue
    }
    return { ok: false, error: message };
  }
};

export { webhookRetryQueue };
