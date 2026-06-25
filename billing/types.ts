export type SubscriptionStatus = "active" | "cancelled" | "expired" | "trial" | "unknown";

export interface SubscriptionRecord {
  userId: string;
  productId?: string;
  entitlements: string[];
  status: SubscriptionStatus;
  plan: string;
  expiresAt?: string;
  updatedAt: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  email?: string;
}

export interface BillingEventInsert {
  externalEventId: string;
  userId?: string;
  eventType: string;
  provider: "stripe" | "revenuecat";
  payload: Record<string, unknown>;
}
