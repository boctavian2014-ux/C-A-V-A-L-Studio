import { pipelineEventBus } from "../pipeline/pipeline-event-bus";
import { Executor } from "./executor";
import { Planner } from "./planner";
import type {
  AgentCreatePlanResult,
  AgentExecuteStepRequest,
  AgentExecuteStepResult,
  AgentRunResult,
  Goal,
  PlanStep
} from "./types";

export class AgentOrchestrator {
  private readonly planner = new Planner();
  private readonly executor = new Executor();
  private currentPlan: PlanStep[] = [];
  private currentGoal: Goal | null = null;
  private running = false;

  async createPlan(goal: Goal): Promise<AgentCreatePlanResult> {
    try {
      this.currentGoal = goal;
      const plan = await this.planner.createPlan(goal);
      this.currentPlan = plan;
      return { ok: true, plan };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, plan: [], error: message };
    }
  }

  getCurrentPlan(): PlanStep[] {
    return [...this.currentPlan];
  }

  isRunning(): boolean {
    return this.running;
  }

  async executeStep(
    request: AgentExecuteStepRequest,
    workspaceRoot: string
  ): Promise<AgentExecuteStepResult> {
    return this.executor.executeStep(request.step, workspaceRoot, {
      confirmed: request.confirmed,
      autoApply: request.autoApply,
      dryRun: request.dryRun ?? this.currentGoal?.dryRun,
      sandbox: request.sandbox ?? this.currentGoal?.sandbox,
      goal: this.currentGoal ?? undefined
    });
  }

  async runPlan(
    plan: PlanStep[],
    workspaceRoot: string,
    isStepConfirmed: (step: PlanStep) => Promise<{ confirmed: boolean; autoApply?: boolean }>
  ): Promise<AgentRunResult> {
    if (this.running) {
      return { ok: false, reason: "already_running" };
    }

    this.running = true;
    this.executor.resetAbort();
    this.currentPlan = plan;

    try {
      for (const step of plan) {
        if (this.executor.isAborted()) {
          pipelineEventBus.emit({
            type: "pipeline.finish",
            timestamp: Date.now(),
            meta: { success: false, cancelled: true, reason: "aborted" }
          });
          return { ok: false, reason: "aborted" };
        }

        const policyNeedsConfirm = step.requiresConfirmation;
        let confirmed = !policyNeedsConfirm;
        let autoApply = false;

        if (policyNeedsConfirm) {
          const decision = await isStepConfirmed(step);
          confirmed = decision.confirmed;
          autoApply = decision.autoApply ?? false;
          if (!confirmed) {
            pipelineEventBus.emit({
              type: "error.occurred",
              message: `User rejected step ${step.id}`,
              timestamp: Date.now(),
              meta: { step }
            });
            pipelineEventBus.emit({
              type: "pipeline.finish",
              timestamp: Date.now(),
              meta: { success: false, reason: "user_rejected", stepId: step.id }
            });
            return { ok: false, reason: "user_rejected" };
          }
        }

        const result = await this.executor.executeStep(step, workspaceRoot, { confirmed, autoApply });

        if (result.reason === "confirmation_required") {
          const decision = await isStepConfirmed(step);
          if (!decision.confirmed) {
            pipelineEventBus.emit({
              type: "error.occurred",
              message: `User rejected step ${step.id}`,
              timestamp: Date.now(),
              meta: { step }
            });
            return { ok: false, reason: "user_rejected" };
          }
          const retry = await this.executor.executeStep(step, workspaceRoot, {
            confirmed: true,
            autoApply: decision.autoApply
          });
          if (!retry.ok) {
            pipelineEventBus.emit({
              type: "pipeline.finish",
              timestamp: Date.now(),
              meta: { success: false, reason: retry.reason, stepId: step.id }
            });
            return retry;
          }
        } else if (!result.ok) {
          pipelineEventBus.emit({
            type: "pipeline.finish",
            timestamp: Date.now(),
            meta: { success: false, reason: result.reason, stepId: step.id }
          });
          return result;
        }
      }

      pipelineEventBus.emit({
        type: "pipeline.finish",
        timestamp: Date.now(),
        meta: { success: true }
      });
      return { ok: true };
    } finally {
      this.running = false;
    }
  }

  abort(): void {
    this.executor.abort();
    this.running = false;
    pipelineEventBus.emit({
      type: "error.occurred",
      message: "Agent run aborted by user",
      timestamp: Date.now(),
      meta: { source: "agent-abort" }
    });
  }
}

export const agentOrchestrator = new AgentOrchestrator();
