import { agentApi } from "../../components/ui/agent-api";
import { eventBus } from "../../components/ui/logicflow/EventBus";
import { replayEvents } from "../../components/ui/logicflow/replay";
import { useLogicFlowStore } from "../../components/ui/logicflow/LogicFlowStore";
import type { PipelineEvent } from "../../components/ui/logicflow/types";
import { auditStore } from "./audit-store";
import { buildAuditReport, createReplayToken } from "./audit-builder";
import type {
  AgentAuditReport,
  AgentRunResult,
  Goal,
  HumanActionRequired,
  PlanStep
} from "./types";

export type RunGoalWithUIOptions = {
  onPlanCreated?: (plan: PlanStep[]) => void;
  onStepStart?: (step: PlanStep) => void;
  onStatus?: (message: string) => void;
  replayOnFinish?: boolean;
  persistAudit?: boolean;
};

const humanActions: HumanActionRequired[] = [];

const recordHumanAction = (
  step: PlanStep,
  reason: string,
  status: HumanActionRequired["status"]
): void => {
  const action: HumanActionRequired = { stepId: step.id, label: step.label, reason, status };
  const idx = humanActions.findIndex((a) => a.stepId === step.id);
  if (idx >= 0) humanActions[idx] = action;
  else humanActions.push(action);
  auditStore.recordHumanAction(action);
};

const finalizeAudit = (
  replayToken: string,
  goal: Goal,
  startedAt: number,
  ok: boolean,
  events: PipelineEvent[]
): AgentAuditReport => {
  const report = buildAuditReport({
    replayToken,
    goal,
    startedAt,
    finishedAt: Date.now(),
    ok,
    events,
    humanActions: [...humanActions]
  });
  auditStore.set(report);
  return report;
};

export async function runGoalWithUI(
  goal: Goal,
  uiConfirm: (step: PlanStep) => Promise<{ confirmed: boolean; autoApply?: boolean }>,
  options?: RunGoalWithUIOptions
): Promise<AgentRunResult & { plan?: PlanStep[]; audit?: AgentAuditReport }> {
  const replayOnFinish = options?.replayOnFinish ?? !goal.dryRun;
  const replayToken = createReplayToken();
  const startedAt = Date.now();
  humanActions.length = 0;

  eventBus.emit({
    type: "pipeline.start",
    timestamp: Date.now(),
    meta: { goal, startedBy: "ui", replayToken, dryRun: goal.dryRun ?? false }
  });

  options?.onStatus?.(goal.dryRun ? "Dry run — creating plan..." : "Creating plan...");

  const planResult = await agentApi.createPlan(goal);
  if (!planResult.ok || planResult.plan.length === 0) {
    const reason = planResult.error ?? "plan_failed";
    eventBus.emit({
      type: "pipeline.finish",
      timestamp: Date.now(),
      meta: { success: false, reason, replayToken }
    });
    const events = useLogicFlowStore.getState().events;
    const audit = finalizeAudit(replayToken, goal, startedAt, false, events);
    return { ok: false, reason, plan: planResult.plan, audit };
  }

  const plan = planResult.plan;
  options?.onPlanCreated?.(plan);
  options?.onStatus?.(`Running ${plan.length} steps...`);

  for (const step of plan) {
    options?.onStepStart?.(step);
    options?.onStatus?.(`Step: ${step.label}`);

    let confirmed = !step.requiresConfirmation;
    let autoApply = false;

    if (step.requiresConfirmation) {
      recordHumanAction(step, "Step requires human confirmation", "pending");
      const decision = await uiConfirm(step);
      confirmed = decision.confirmed;
      autoApply = decision.autoApply ?? false;
      recordHumanAction(
        step,
        "Step requires human confirmation",
        confirmed ? "confirmed" : "rejected"
      );
      if (!confirmed) {
        eventBus.emit({
          type: "error.occurred",
          message: `User rejected step ${step.id}`,
          timestamp: Date.now(),
          meta: { step, replayToken }
        });
        eventBus.emit({
          type: "pipeline.finish",
          timestamp: Date.now(),
          meta: { success: false, reason: "user_rejected", stepId: step.id, replayToken }
        });
        const events = useLogicFlowStore.getState().events;
        const audit = finalizeAudit(replayToken, goal, startedAt, false, events);
        return { ok: false, reason: "user_rejected", plan, audit };
      }
    }

    const result = await agentApi.executeStep(step, confirmed, autoApply, {
      dryRun: goal.dryRun,
      sandbox: goal.sandbox
    });

    if (result.reason === "confirmation_required") {
      recordHumanAction(step, String(result.detail ?? "Policy requires confirmation"), "pending");
      const decision = await uiConfirm(step);
      recordHumanAction(
        step,
        String(result.detail ?? "Policy requires confirmation"),
        decision.confirmed ? "confirmed" : "rejected"
      );
      if (!decision.confirmed) {
        eventBus.emit({
          type: "error.occurred",
          message: `User rejected step ${step.id}`,
          timestamp: Date.now(),
          meta: { step, replayToken }
        });
        eventBus.emit({
          type: "pipeline.finish",
          timestamp: Date.now(),
          meta: { success: false, reason: "user_rejected", stepId: step.id, replayToken }
        });
        const events = useLogicFlowStore.getState().events;
        const audit = finalizeAudit(replayToken, goal, startedAt, false, events);
        return { ok: false, reason: "user_rejected", plan, audit };
      }
      const retry = await agentApi.executeStep(step, true, decision.autoApply, {
        dryRun: goal.dryRun,
        sandbox: goal.sandbox
      });
      if (!retry.ok) {
        eventBus.emit({
          type: "pipeline.finish",
          timestamp: Date.now(),
          meta: { success: false, reason: retry.reason, stepId: step.id, replayToken }
        });
        const events = useLogicFlowStore.getState().events;
        const audit = finalizeAudit(replayToken, goal, startedAt, false, events);
        return { ...retry, plan, audit };
      }
    } else if (!result.ok) {
      eventBus.emit({
        type: "pipeline.finish",
        timestamp: Date.now(),
        meta: { success: false, reason: result.reason, stepId: step.id, replayToken }
      });
      const events = useLogicFlowStore.getState().events;
      const audit = finalizeAudit(replayToken, goal, startedAt, false, events);
      return { ...result, plan, audit };
    }
  }

  eventBus.emit({
    type: "pipeline.finish",
    timestamp: Date.now(),
    meta: { success: true, replayToken, dryRun: goal.dryRun ?? false }
  });

  const events = useLogicFlowStore.getState().events;
  const audit = finalizeAudit(replayToken, goal, startedAt, true, events);

  if (options?.persistAudit !== false) {
    void agentApi.saveAudit?.(audit);
  }

  if (replayOnFinish && events.length > 0) {
    await replayEvents(events, 2);
  }

  return { ok: true, plan, audit };
}

export async function abortAgentRun(): Promise<void> {
  await agentApi.abort();
  eventBus.emit({
    type: "error.occurred",
    message: "Agent run aborted by user",
    timestamp: Date.now(),
    meta: { source: "agent-ui" }
  });
}

/** Renderer entry point matching the Cursor/agent integration prompt. */
export const cursorAgent = {
  runGoal: runGoalWithUI,
  abort: abortAgentRun
};
