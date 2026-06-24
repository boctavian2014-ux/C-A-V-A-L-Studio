import type { RevenueCatWebhookEvent } from "./validate-signature";

export type BillingEventType =
  | "subscription_activated"
  | "subscription_renewed"
  | "subscription_cancelled"
  | "subscription_expired"
  | "trial_started"
  | "unknown";

export interface MappedBillingEvent {
  type: BillingEventType;
  userId: string;
  productId?: string;
  entitlements: string[];
  expiresAt?: string;
  rawType: string;
}

const EVENT_MAP: Record<string, BillingEventType> = {
  INITIAL_PURCHASE: "subscription_activated",
  RENEWAL: "subscription_renewed",
  CANCELLATION: "subscription_cancelled",
  EXPIRATION: "subscription_expired",
  TRIAL_STARTED: "trial_started"
};

export const mapRevenueCatEvent = (event: RevenueCatWebhookEvent): MappedBillingEvent => ({
  type: EVENT_MAP[event.type] ?? "unknown",
  userId: event.app_user_id,
  productId: event.product_id,
  entitlements: event.entitlement_ids ?? [],
  expiresAt: event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : undefined,
  rawType: event.type
});
