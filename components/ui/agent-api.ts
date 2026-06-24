import type { AgentCreatePlanResult, AgentExecuteStepResult, Goal, PlanStep } from "../../ai/agent/types";

interface CavalAgentBridge {
  agentCreatePlan?: (goal: Goal) => Promise<AgentCreatePlanResult>;
  agentExecuteStep?: (input: {
    step: PlanStep;
    confirmed: boolean;
    autoApply?: boolean;
    dryRun?: boolean;
    sandbox?: boolean;
  }) => Promise<AgentExecuteStepResult>;
  agentSaveAudit?: (audit: import("../../ai/agent/types").AgentAuditReport) => Promise<{ ok: boolean }>;
  agentAbort?: () => Promise<{ ok: boolean }>;
  sandboxRun?: (input: {
    toolCallId: string;
    tool: string;
    input?: unknown;
    confirm?: boolean;
  }) => Promise<{ ok: boolean; output?: unknown; error?: string }>;
}

const caval = (window as unknown as { caval?: CavalAgentBridge }).caval;

export const agentApi = {
  async createPlan(goal: Goal): Promise<AgentCreatePlanResult> {
    return caval?.agentCreatePlan?.(goal) ?? { ok: false, plan: [], error: "Agent API unavailable" };
  },

  async executeStep(
    step: PlanStep,
    confirmed: boolean,
    autoApply?: boolean,
    options?: { dryRun?: boolean; sandbox?: boolean }
  ): Promise<AgentExecuteStepResult> {
    return caval?.agentExecuteStep?.({
      step,
      confirmed,
      autoApply,
      dryRun: options?.dryRun,
      sandbox: options?.sandbox
    }) ?? { ok: false, reason: "Agent API unavailable" };
  },

  async saveAudit(audit: import("../../ai/agent/types").AgentAuditReport): Promise<{ ok: boolean }> {
    return caval?.agentSaveAudit?.(audit) ?? { ok: false };
  },

  async abort(): Promise<{ ok: boolean }> {
    return caval?.agentAbort?.() ?? { ok: false };
  },

  async sandboxRun(
    tool: string,
    input?: unknown,
    toolCallId?: string
  ): Promise<{ ok: boolean; output?: unknown; error?: string }> {
    return caval?.sandboxRun?.({
      toolCallId: toolCallId ?? `sandbox-${Date.now()}`,
      tool,
      input,
      confirm: true
    }) ?? { ok: false, error: "Sandbox API unavailable" };
  }
};
