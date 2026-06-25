import type { MappedBillingEvent } from "./map-event";
import type { SubscriptionRecord } from "../types";
import {
  getSubscription,
  listSubscriptions,
  resetSubscriptionsForTests,
  updateSubscriptionFromRc,
} from "../subscription-store";

export type { SubscriptionRecord };

/** @deprecated Use subscription-store / Supabase repository for Stripe */
export const updateSubscription = (event: MappedBillingEvent): SubscriptionRecord =>
  updateSubscriptionFromRc(event);

export { resetSubscriptionsForTests, getSubscription, listSubscriptions };
