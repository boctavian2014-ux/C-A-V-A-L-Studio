import type { MappedBillingEvent } from "./map-event";

export interface SubscriptionRecord {
  userId: string;
  productId?: string;
  entitlements: string[];
  status: "active" | "cancelled" | "expired" | "trial" | "unknown";
  expiresAt?: string;
  updatedAt: string;
}

const subscriptions = new Map<string, SubscriptionRecord>();

export const updateSubscription = (event: MappedBillingEvent): SubscriptionRecord => {
  const status: SubscriptionRecord["status"] =
    event.type === "subscription_activated" || event.type === "subscription_renewed"
      ? "active"
      : event.type === "trial_started"
        ? "trial"
        : event.type === "subscription_cancelled"
          ? "cancelled"
          : event.type === "subscription_expired"
            ? "expired"
            : "unknown";

  const record: SubscriptionRecord = {
    userId: event.userId,
    productId: event.productId,
    entitlements: event.entitlements,
    status,
    expiresAt: event.expiresAt,
    updatedAt: new Date().toISOString()
  };

  subscriptions.set(event.userId, record);
  return record;
};

export const resetSubscriptionsForTests = (): void => {
  subscriptions.clear();
};

export const getSubscription = (userId: string): SubscriptionRecord | undefined =>
  subscriptions.get(userId);

export const listSubscriptions = (): SubscriptionRecord[] => [...subscriptions.values()];
