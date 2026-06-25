import type { MappedBillingEvent } from "./revenuecat/map-event";
import type { SubscriptionRecord, SubscriptionStatus } from "./types";

const subscriptions = new Map<string, SubscriptionRecord>();

function statusFromRcEvent(type: MappedBillingEvent["type"]): SubscriptionStatus {
  if (type === "subscription_activated" || type === "subscription_renewed") return "active";
  if (type === "trial_started") return "trial";
  if (type === "subscription_cancelled") return "cancelled";
  if (type === "subscription_expired") return "expired";
  return "unknown";
}

export const updateSubscriptionFromRc = (event: MappedBillingEvent): SubscriptionRecord => {
  const record: SubscriptionRecord = {
    userId: event.userId,
    productId: event.productId,
    entitlements: event.entitlements,
    status: statusFromRcEvent(event.type),
    plan: event.entitlements.includes("pro") ? "pro" : "community",
    expiresAt: event.expiresAt,
    updatedAt: new Date().toISOString(),
  };
  subscriptions.set(event.userId, record);
  return record;
};

export const updateSubscriptionMemory = (record: SubscriptionRecord): SubscriptionRecord => {
  subscriptions.set(record.userId, { ...record, updatedAt: new Date().toISOString() });
  return subscriptions.get(record.userId)!;
};

export const resetSubscriptionsForTests = (): void => {
  subscriptions.clear();
};

export const getSubscription = (userId: string): SubscriptionRecord | undefined =>
  subscriptions.get(userId);

export const listSubscriptions = (): SubscriptionRecord[] => [...subscriptions.values()];

export const getMemoryStore = (): Map<string, SubscriptionRecord> => subscriptions;
