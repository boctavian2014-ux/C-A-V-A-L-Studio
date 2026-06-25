import type Stripe from "stripe";
import { insertBillingEvent, upsertSubscriptionFromStripe } from "../supabase/repository";
import { updateSubscriptionMemory } from "../subscription-store";
import { isSupabaseConfigured } from "../supabase/client";
import { mapStripeEvent } from "./map-event";
import { getStripeClient } from "./client";

export const handleStripeWebhook = async (
  rawBody: Buffer | string,
  signatureHeader: string | undefined
): Promise<{ ok: boolean; error?: string }> => {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return { ok: false, error: "STRIPE_WEBHOOK_SECRET not configured" };
  }
  if (!signatureHeader) {
    return { ok: false, error: "Missing Stripe signature" };
  }

  let event: Stripe.Event;
  try {
    event = getStripeClient().webhooks.constructEvent(
      rawBody,
      signatureHeader,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }

  if (isSupabaseConfigured()) {
    const inserted = await insertBillingEvent({
      externalEventId: event.id,
      eventType: event.type,
      provider: "stripe",
      payload: event.data.object as unknown as Record<string, unknown>,
    });
    if (!inserted) {
      return { ok: true };
    }
  }

  const mapped = mapStripeEvent(event);
  if (!mapped) {
    return { ok: true };
  }

  const record = {
    userId: mapped.cavalId,
    cavalId: mapped.cavalId,
    email: mapped.email,
    stripeCustomerId: mapped.stripeCustomerId,
    stripeSubscriptionId: mapped.stripeSubscriptionId ?? `pending-${mapped.eventId}`,
    stripePriceId: mapped.stripePriceId,
    productId: mapped.productId,
    status: mapped.status,
    plan: mapped.plan,
    entitlements: mapped.entitlements,
    expiresAt: mapped.expiresAt,
  };

  if (isSupabaseConfigured()) {
    await upsertSubscriptionFromStripe(record);
  } else {
    updateSubscriptionMemory({
      userId: mapped.cavalId,
      productId: mapped.productId,
      entitlements: mapped.entitlements,
      status: mapped.status,
      plan: mapped.plan,
      expiresAt: mapped.expiresAt,
      updatedAt: new Date().toISOString(),
      stripeCustomerId: mapped.stripeCustomerId,
      stripeSubscriptionId: mapped.stripeSubscriptionId,
      stripePriceId: mapped.stripePriceId,
      email: mapped.email,
    });
  }

  return { ok: true };
};
