/**
 * Subscription foundation types (Revolut manual payment-link MVP).
 * Distinct from legacy Stripe/RevenueCat SubscriptionRecord in ./types.
 */

export type PlanId = "free" | "pro" | "ultra";

export type ModelTier = "fast" | "standard" | "ultra";

export type RevolutSubscriptionStatus = "active" | "past_due" | "canceled";

export type BillingMode = "manual_payment_link";

export type MeteredProviderId =
  | "openai"
  | "anthropic"
  | "stepfun"
  | "zoo"
  | "piapi"
  | "meshy"
  | "nvidia"
  | "openrouter";

export interface ModelUsageEntry {
  provider: MeteredProviderId;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costAccruedUsd: number;
}

export interface UsageRecord {
  userId: string;
  periodStart: string;
  periodEnd: string;
  requestsUsed: number;
  cadJobsUsed: number;
  zooCostAccrued: number;
  chatTokensUsed: number;
  /** Populated by metering PR — may be empty for users with no metered traffic. */
  modelUsage: ModelUsageEntry[];
}

export interface PlanLimits {
  chatTokens: number;
  cadJobs: number;
  zooBudgetUsd: number;
  allowedModelTiers: ModelTier[];
  /** Soft concurrency caps (PR2). */
  maxConcurrentChatStreams: number;
  maxConcurrentCadJobs: number;
}

export interface RevolutSubscriptionRecord {
  userId: string;
  plan: PlanId;
  status: RevolutSubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  activatedAt: string;
  billingMode: BillingMode;
  revolutPaymentReference?: string;
  updatedAt: string;
}

export interface SubscriptionSummary {
  subscription: {
    plan: PlanId;
    status: RevolutSubscriptionStatus;
    currentPeriodStart: string;
    currentPeriodEnd: string;
  };
  limits: PlanLimits;
  usage: {
    chatTokensUsed: number;
    cadJobsUsed: number;
    zooCostAccrued: number;
    requestsUsed: number;
  };
}

export interface ActivateSubscriptionInput {
  userId: string;
  plan: Exclude<PlanId, "free">;
  revolutPaymentReference?: string;
  /** Override period length in days (tests / fixtures). Default 30. */
  periodDays?: number;
  activatedAt?: string;
}
