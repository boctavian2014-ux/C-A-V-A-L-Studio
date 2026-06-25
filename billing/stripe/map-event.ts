import type Stripe from "stripe";
import type { SubscriptionStatus } from "../types";

export interface MappedStripeEvent {
  eventId: string;
  eventType: string;
  cavalId: string;
  email?: string;
  stripeCustomerId: string;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  productId?: string;
  status: SubscriptionStatus;
  plan: string;
  entitlements: string[];
  expiresAt?: string;
  raw: Record<string, unknown>;
}

const subscriptionStatus = (status: string | undefined): SubscriptionStatus => {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trial";
    case "canceled":
      return "cancelled";
    case "unpaid":
    case "past_due":
    case "incomplete_expired":
      return "expired";
    default:
      return "unknown";
  }
};

const metadataCavalId = (metadata: Stripe.Metadata | null | undefined, customerId: string): string =>
  metadata?.caval_id ?? metadata?.cavalId ?? customerId;

export const mapStripeEvent = (event: Stripe.Event): MappedStripeEvent | null => {
  const base = {
    eventId: event.id,
    eventType: event.type,
    raw: event.data.object as unknown as Record<string, unknown>,
  };

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
    if (!customerId) return null;
    const cavalId = metadataCavalId(session.metadata, customerId);
    const subId =
      typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
    return {
      ...base,
      cavalId,
      email: session.customer_details?.email ?? session.customer_email ?? undefined,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subId,
      stripePriceId: process.env.STRIPE_PRICE_PRO,
      productId: "pro",
      status: "active",
      plan: "pro",
      entitlements: ["pro"],
    };
  }

  if (
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted" ||
    event.type === "customer.subscription.created"
  ) {
    const sub = event.data.object as Stripe.Subscription;
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
    if (!customerId) return null;
    const cavalId = metadataCavalId(sub.metadata, customerId);
    const priceId = sub.items.data[0]?.price?.id;
    const status = subscriptionStatus(sub.status);
    const active = status === "active" || status === "trial";
    const periodEnd = (sub as Stripe.Subscription & { current_period_end?: number }).current_period_end;
    return {
      ...base,
      cavalId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: sub.id,
      stripePriceId: priceId,
      productId: active ? "pro" : undefined,
      status,
      plan: active ? "pro" : "community",
      entitlements: active ? ["pro"] : [],
      expiresAt: periodEnd ? new Date(periodEnd * 1000).toISOString() : undefined,
    };
  }

  if (event.type === "invoice.paid") {
    const invoice = event.data.object as Stripe.Invoice & {
      subscription?: string | Stripe.Subscription | null;
    };
    const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
    if (!customerId) return null;
    const cavalId = metadataCavalId(invoice.metadata, customerId);
    const subRef = invoice.subscription;
    const subId = typeof subRef === "string" ? subRef : subRef?.id;
    return {
      ...base,
      cavalId,
      email: invoice.customer_email ?? undefined,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subId ?? undefined,
      status: "active",
      plan: "pro",
      entitlements: ["pro"],
    };
  }

  return null;
};
