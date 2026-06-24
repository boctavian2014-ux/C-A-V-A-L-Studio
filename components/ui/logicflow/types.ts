import type { ComposerPhase } from "../../../ai/composer/types";

export type LogicFlowNodeId = "suggestions" | "composer" | "review" | "debug";

export type LogicFlowNodeStage = "gate" | "core" | "support";

export type LogicFlowNodeStatus = "idle" | "active" | "done" | "failed";

export interface LogicFlowNodeData {
  id: LogicFlowNodeId;
  label: string;
  description: string;
  x: number;
  y: number;
  stage: LogicFlowNodeStage;
  status?: LogicFlowNodeStatus;
  active?: boolean;
}

export type LogicFlowEdgeId = "e1" | "e2" | "e3";

export interface LogicFlowEdgeData {
  id: LogicFlowEdgeId | string;
  fromId: LogicFlowNodeId;
  toId: LogicFlowNodeId;
}

export interface LogicFlowPoint {
  x: number;
  y: number;
}

export interface LogicFlowExplainContext {
  composerPhase?: ComposerPhase;
  workspaceRoot?: string;
}

export interface LogicFlowExplainRequest {
  nodeId: LogicFlowNodeId;
  label: string;
  description: string;
  context?: LogicFlowExplainContext;
}

export interface LogicFlowExplainResponse {
  ok: boolean;
  content: string;
  error?: string;
}

export interface LogicFlowPipelineStepEvent {
  nodeId: LogicFlowNodeId;
  edgeId?: string | null;
}

export type PipelineEvent =
  | { type: "pipeline.start"; timestamp: number; meta?: Record<string, unknown> }
  | { type: "node.enter"; nodeId: LogicFlowNodeId; timestamp: number; meta?: Record<string, unknown> }
  | { type: "edge.activate"; edgeId: string; timestamp: number; meta?: Record<string, unknown> }
  | { type: "tool.call"; id: string; tool: string; input?: unknown; timestamp: number; meta?: Record<string, unknown> }
  | { type: "tool.result"; id: string; success: boolean; output?: unknown; timestamp: number; meta?: Record<string, unknown> }
  | { type: "error.occurred"; nodeId?: LogicFlowNodeId; message: string; stack?: string; timestamp: number; meta?: Record<string, unknown> }
  | { type: "pipeline.finish"; timestamp: number; meta?: Record<string, unknown> };

export type Listener = (event: PipelineEvent) => void;
