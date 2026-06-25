import { listSubscriptions } from "./revenuecat/update-subscription";
import { webhookRetryQueue } from "./revenuecat/webhook";
import { isStripeConfigured } from "./stripe/client";
import { isSupabaseConfigured } from "./supabase/client";
import { countSubscriptions } from "./supabase/repository";

export interface BillingHealthStatus {
  ok: boolean;
  subscriptions: number;
  pendingRetries: number;
  stripeConfigured: boolean;
  supabaseConfigured: boolean;
  revenueCatSecretConfigured: boolean;
  legacyRevenueCatEnabled: boolean;
  checkedAt: string;
}

export const billingHealthCheck = async (): Promise<BillingHealthStatus> => {
  const stripeConfigured = isStripeConfigured();
  const supabaseConfigured = isSupabaseConfigured();
  const revenueCatSecretConfigured = Boolean(process.env.REVENUECAT_WEBHOOK_SECRET);
  const legacyRevenueCatEnabled = process.env.ENABLE_REVENUECAT_WEBHOOK === "true";

  let subscriptionCount = listSubscriptions().length;
  if (supabaseConfigured) {
    try {
      subscriptionCount = await countSubscriptions();
    } catch {
      subscriptionCount = listSubscriptions().length;
    }
  }

  const ok =
    (stripeConfigured && Boolean(process.env.STRIPE_WEBHOOK_SECRET)) ||
    supabaseConfigured ||
    revenueCatSecretConfigured;

  return {
    ok,
    subscriptions: subscriptionCount,
    pendingRetries: webhookRetryQueue.pendingCount(),
    stripeConfigured,
    supabaseConfigured,
    revenueCatSecretConfigured,
    legacyRevenueCatEnabled,
    checkedAt: new Date().toISOString(),
  };
};
