import type { LogicFlowNodeId } from "../../components/ui/logicflow/types";

export type AgentPlatform = "android" | "ios" | "ota";

export type AgentGoalMode = "human-in-loop" | "auto";

export type ConfirmationTopic = "publish" | "credentials" | "compose" | "review";

export type Goal = {
  action: "publish";
  version: string;
  platforms: AgentPlatform[];
  notes?: string;
  mode?: AgentGoalMode;
  sandbox?: boolean;
  dryRun?: boolean;
  requireConfirmationFor?: ConfirmationTopic[];
};

export type PlatformBuildStatus = {
  platform: AgentPlatform;
  status: "pending" | "success" | "failed" | "skipped" | "dry_run";
  message?: string;
};

export type AuditTimelineEntry = {
  timestamp: number;
  type: string;
  label: string;
  meta?: Record<string, unknown>;
};

export type AuditCommandEntry = {
  id: string;
  command: string;
  output?: unknown;
  success: boolean;
  timestamp: number;
  dryRun?: boolean;
};

export type AuditPatchEntry = {
  path: string;
  diff: string;
};

export type HumanActionRequired = {
  stepId: string;
  label: string;
  reason: string;
  status: "pending" | "confirmed" | "rejected";
};

export type AgentAuditReport = {
  replayToken: string;
  goal: Goal;
  startedAt: number;
  finishedAt: number;
  ok: boolean;
  dryRun: boolean;
  summary: PlatformBuildStatus[];
  timeline: AuditTimelineEntry[];
  commands: AuditCommandEntry[];
  patches: AuditPatchEntry[];
  humanActionsRequired: HumanActionRequired[];
  unresolvedIssues: string[];
};

export type PlanStepType = "suggest" | "compose" | "build" | "test" | "review" | "publish" | "manual";

export type PlanStep = {
  id: string;
  type: PlanStepType;
  label: string;
  meta?: Record<string, unknown>;
  requiresConfirmation?: boolean;
};

export type PolicyDecision = {
  allowed: boolean;
  reason?: string;
  requireHuman?: boolean;
};

export type AgentStepResult = {
  ok: boolean;
  reason?: string;
  detail?: unknown;
  output?: unknown;
};

export type AgentRunResult = {
  ok: boolean;
  reason?: string;
  detail?: unknown;
  audit?: AgentAuditReport;
};

export type AgentCreatePlanResult = {
  ok: boolean;
  plan: PlanStep[];
  error?: string;
};

export type AgentExecuteStepRequest = {
  step: PlanStep;
  confirmed: boolean;
  autoApply?: boolean;
  dryRun?: boolean;
  sandbox?: boolean;
};

export type AgentExecuteStepResult = AgentStepResult;

export const stepTypeToNodeId = (type: PlanStepType): LogicFlowNodeId => {
  switch (type) {
    case "suggest":
      return "suggestions";
    case "compose":
    case "build":
      return "composer";
    case "test":
    case "review":
    case "manual":
      return "review";
    case "publish":
      return "debug";
    default:
      return "composer";
  }
};
