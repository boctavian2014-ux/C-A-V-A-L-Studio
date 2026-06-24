import { listSubscriptions } from "./revenuecat/update-subscription";
import { webhookRetryQueue } from "./revenuecat/webhook";

export interface BillingHealthStatus {
  ok: boolean;
  subscriptions: number;
  pendingRetries: number;
  revenueCatSecretConfigured: boolean;
  checkedAt: string;
}

export const billingHealthCheck = (): BillingHealthStatus => ({
  ok: Boolean(process.env.REVENUECAT_WEBHOOK_SECRET),
  subscriptions: listSubscriptions().length,
  pendingRetries: webhookRetryQueue.pendingCount(),
  revenueCatSecretConfigured: Boolean(process.env.REVENUECAT_WEBHOOK_SECRET),
  checkedAt: new Date().toISOString()
});
