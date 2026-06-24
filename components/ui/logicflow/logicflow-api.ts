import { useLogicFlowStore } from "./LogicFlowStore";
import type { ComposerPhase } from "../../../ai/composer/types";
import type { LogicFlowExplainRequest, LogicFlowExplainResponse, LogicFlowNodeId } from "./types";

interface CavalLogicFlowBridge {
  logicflowExplainNode?: (request: LogicFlowExplainRequest) => Promise<LogicFlowExplainResponse>;
}

const caval = (window as unknown as { caval?: CavalLogicFlowBridge }).caval;

const FALLBACK: Record<LogicFlowNodeId, string> = {
  suggestions:
    "Analyzes the request and proposes alternatives before plan/patch generation. Opens automatically at awaiting_suggestions.",
  composer: "Generates plan and patches after suggestions are approved. Core transformation stage of the pipeline.",
  review: "Human gate for patch approval. Active at awaiting_review before changes hit the workspace.",
  debug: "Diagnoses errors and suggests fixes after build or validation failures."
};

export const logicflowApi = {
  async explainNode(nodeId: LogicFlowNodeId, context?: LogicFlowExplainRequest["context"]): Promise<void> {
    const store = useLogicFlowStore.getState();
    const node = store.nodes.find((entry) => entry.id === nodeId);
    if (!node) return;

    store.selectNode(nodeId);
    store.setExplaining(true);

    try {
      const response = await caval?.logicflowExplainNode?.({
        nodeId,
        label: node.label,
        description: node.description,
        context
      });
      store.setExplanation(response?.content ?? FALLBACK[nodeId]);
    } catch {
      store.setExplanation(FALLBACK[nodeId]);
    } finally {
      store.setExplaining(false);
    }
  },

  syncComposerPhase(phase: ComposerPhase | "running"): void {
    if (!useLogicFlowStore.getState().liveFlowEnabled) return;
    useLogicFlowStore.getState().syncFromComposerPhase(phase);
  },

  setPipelineStep(nodeId: LogicFlowNodeId, edgeId?: string | null): void {
    useLogicFlowStore.getState().setPipelineStep(nodeId, edgeId);
  }
};
