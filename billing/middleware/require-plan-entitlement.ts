/**
 * Entitlement checks before expensive provider / CAD calls.
 * Does not call providers — only reads plan + usage and throws PlanEntitlementError.
 */

import {
  PlanEntitlementError,
  nextPlanForQuota,
  nextPlanForTier,
  type UpgradeRequiredPayload,
} from "../entitlement-errors";
import { resolveModelTier } from "../model-registry";
import { getPlanLimits } from "../plan-catalog";
import {
  countActiveCadReservations,
  countActiveChatStreams,
} from "../metering/concurrency-tracker";
import { getSubscriptionSummary } from "../subscriptions/service";
import type { ModelTier, PlanId } from "../subscription-types";

export type EntitlementAction = "chat" | "cad_job";

export interface RequirePlanEntitlementInput {
  userId: string;
  action: EntitlementAction;
  /** Required for chat when a concrete model is known. */
  modelId?: string;
  /** Estimated Zoo USD to reserve (cad_job). */
  estimatedZooCostUsd?: number;
  now?: Date;
  env?: NodeJS.ProcessEnv;
}

function denial(
  partial: Omit<UpgradeRequiredPayload, "error" | "code"> & {
    code?: UpgradeRequiredPayload["code"];
  }
): never {
  throw new PlanEntitlementError({
    error: "upgrade_required",
    code: partial.code ?? "upgrade_required",
    reason: partial.reason,
    currentPlan: partial.currentPlan,
    requiredPlan: partial.requiredPlan,
    resetsAt: partial.resetsAt,
    message: partial.message,
    details: partial.details,
  });
}

export function requirePlanEntitlement(input: RequirePlanEntitlementInput): {
  plan: PlanId;
  resetsAt: string;
  allowedModelTiers: ModelTier[];
} {
  const now = input.now ?? new Date();
  const env = input.env ?? process.env;
  const userId = input.userId.trim() || "anonymous";
  const summary = getSubscriptionSummary(userId, now, env);
  const plan = summary.subscription.plan;
  const limits = getPlanLimits(plan, env);
  const resetsAt = summary.subscription.currentPeriodEnd;

  if (input.action === "chat") {
    if (summary.usage.chatTokensUsed >= limits.chatTokens) {
      denial({
        code: "quota_exceeded",
        reason: "monthly_chat_tokens_exhausted",
        currentPlan: plan,
        requiredPlan: nextPlanForQuota(plan),
        resetsAt,
        message: "Monthly chat token quota exhausted. Upgrade your plan.",
        details: { limit: limits.chatTokens, used: summary.usage.chatTokensUsed },
      });
    }

    if (countActiveChatStreams(userId) >= limits.maxConcurrentChatStreams) {
      denial({
        code: "plan_limit",
        reason: "plan_concurrency_limit",
        currentPlan: plan,
        requiredPlan: nextPlanForQuota(plan),
        resetsAt,
        message: "Concurrent chat stream limit reached for this plan.",
        details: {
          limit: limits.maxConcurrentChatStreams,
          used: countActiveChatStreams(userId),
        },
      });
    }

    if (input.modelId) {
      const tier = resolveModelTier(input.modelId);
      if (tier && !limits.allowedModelTiers.includes(tier)) {
        denial({
          reason: "model_tier_not_allowed",
          currentPlan: plan,
          requiredPlan: nextPlanForTier(tier, plan),
          resetsAt,
          message: `Model tier "${tier}" is not included in the ${plan} plan.`,
          details: { modelId: input.modelId, modelTier: tier },
        });
      }
    }
  }

  if (input.action === "cad_job") {
    if (summary.usage.cadJobsUsed >= limits.cadJobs) {
      denial({
        code: "quota_exceeded",
        reason: "monthly_cad_jobs_exhausted",
        currentPlan: plan,
        requiredPlan: nextPlanForQuota(plan),
        resetsAt,
        message: "Monthly CAD job quota exhausted. Upgrade your plan.",
        details: { limit: limits.cadJobs, used: summary.usage.cadJobsUsed },
      });
    }

    const estimated = Math.max(0, input.estimatedZooCostUsd ?? 0);
    if (summary.usage.zooCostAccrued + estimated > limits.zooBudgetUsd + 1e-9) {
      denial({
        code: "quota_exceeded",
        reason: "monthly_zoo_budget_exhausted",
        currentPlan: plan,
        requiredPlan: nextPlanForQuota(plan),
        resetsAt,
        message: "Monthly Zoo budget exhausted. Upgrade your plan.",
        details: {
          limit: limits.zooBudgetUsd,
          used: summary.usage.zooCostAccrued,
        },
      });
    }

    if (countActiveCadReservations(userId) >= limits.maxConcurrentCadJobs) {
      denial({
        code: "plan_limit",
        reason: "plan_concurrency_limit",
        currentPlan: plan,
        requiredPlan: nextPlanForQuota(plan),
        resetsAt,
        message: "Concurrent CAD job limit reached for this plan.",
        details: {
          limit: limits.maxConcurrentCadJobs,
          used: countActiveCadReservations(userId),
        },
      });
    }
  }

  return { plan, resetsAt, allowedModelTiers: [...limits.allowedModelTiers] };
}
