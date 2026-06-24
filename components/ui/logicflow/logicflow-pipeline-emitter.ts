import { pipelineEventBus } from "../../../ai/pipeline/pipeline-event-bus";
import type { LogicFlowNodeId } from "./types";

export interface LogicFlowPipelineStep {
  nodeId: LogicFlowNodeId;
  edgeId?: string | null;
}

type PipelineListener = (step: LogicFlowPipelineStep) => void;

/** Incoming edge that pulses when control reaches a node. */
export const INCOMING_EDGE: Record<LogicFlowNodeId, string | null> = {
  suggestions: null,
  composer: "e1",
  review: "e2",
  debug: "e3"
};

class LogicFlowPipelineEmitter {
  private readonly listeners = new Set<PipelineListener>();

  subscribe(listener: PipelineListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(step: LogicFlowPipelineStep): void {
    const now = Date.now();
    const edgeId = step.edgeId !== undefined ? step.edgeId : INCOMING_EDGE[step.nodeId];

    pipelineEventBus.emit({ type: "node.enter", nodeId: step.nodeId, timestamp: now });
    if (edgeId) {
      pipelineEventBus.emit({ type: "edge.activate", edgeId, timestamp: now });
    }

    for (const listener of this.listeners) {
      listener({ nodeId: step.nodeId, edgeId });
    }
  }
}

export const logicFlowPipelineEmitter = new LogicFlowPipelineEmitter();

export { pipelineEventBus };
