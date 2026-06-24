import { createRoot, type Root } from "react-dom/client";
import type { ComposerPhase } from "../../ai/composer/types";
import { eventBus } from "../../components/ui/logicflow/EventBus";
import { LogicFlowApp, type LogicFlowMountTargets } from "../../components/ui/logicflow/LogicFlowApp";
import { ensureLogicFlowEventBusSubscription, useLogicFlowStore } from "../../components/ui/logicflow/LogicFlowStore";
import type { LogicFlowNodeId, LogicFlowPipelineStepEvent, PipelineEvent } from "../../components/ui/logicflow/types";

export interface CavalLogicFlowGlobal {
  mount: (targets: LogicFlowMountTargets) => void;
  unmount: () => void;
  syncPhase: (phase: ComposerPhase | "running") => void;
  syncPipelineStep: (nodeId: LogicFlowNodeId, edgeId?: string | null) => void;
  forwardEvent: (event: PipelineEvent) => void;
}

let reactRoot: Root | null = null;
let host: HTMLDivElement | null = null;

ensureLogicFlowEventBusSubscription();

const mount: CavalLogicFlowGlobal["mount"] = (targets) => {
  if (!host) {
    host = document.createElement("div");
    host.id = "logicflow-react-host";
    host.style.display = "none";
    document.body.appendChild(host);
  }
  if (!reactRoot) {
    reactRoot = createRoot(host);
  }
  reactRoot.render(<LogicFlowApp {...targets} />);
  useLogicFlowStore.getState().centerView();
};

const unmount: CavalLogicFlowGlobal["unmount"] = () => {
  reactRoot?.unmount();
  reactRoot = null;
  host?.remove();
  host = null;
};

const syncPhase: CavalLogicFlowGlobal["syncPhase"] = (phase) => {
  useLogicFlowStore.getState().syncFromComposerPhase(phase);
};

const syncPipelineStep: CavalLogicFlowGlobal["syncPipelineStep"] = (nodeId, edgeId) => {
  useLogicFlowStore.getState().setPipelineStep(nodeId, edgeId);
};

const forwardEvent: CavalLogicFlowGlobal["forwardEvent"] = (event) => {
  eventBus.emit(event);
};

(window as unknown as { CavalLogicFlow: CavalLogicFlowGlobal }).CavalLogicFlow = {
  mount,
  unmount,
  syncPhase,
  syncPipelineStep,
  forwardEvent
};

export type { LogicFlowPipelineStepEvent };
