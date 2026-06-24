import { create } from "zustand";
import type { ComposerPhase } from "../../../ai/composer/types";
import { eventBus } from "./EventBus";
import { INCOMING_EDGE } from "./logicflow-pipeline-emitter";
import type { LogicFlowEdgeData, LogicFlowNodeData, LogicFlowNodeId, PipelineEvent } from "./types";

const DEFAULT_NODES: LogicFlowNodeData[] = [
  {
    id: "suggestions",
    label: "AI Suggestions",
    description: "Analyze request and propose options",
    x: 100,
    y: 100,
    stage: "gate",
    status: "idle",
    active: false
  },
  {
    id: "composer",
    label: "AI Composer",
    description: "Generate plan and patches",
    x: 400,
    y: 200,
    stage: "core",
    status: "idle",
    active: false
  },
  {
    id: "review",
    label: "Code Review Panel",
    description: "Approve or reject patches",
    x: 700,
    y: 100,
    stage: "gate",
    status: "idle",
    active: false
  },
  {
    id: "debug",
    label: "AI Debug Panel",
    description: "Explain errors and fix",
    x: 1000,
    y: 200,
    stage: "support",
    status: "idle",
    active: false
  }
];

const DEFAULT_EDGES: LogicFlowEdgeData[] = [
  { id: "e1", fromId: "suggestions", toId: "composer" },
  { id: "e2", fromId: "composer", toId: "review" },
  { id: "e3", fromId: "review", toId: "debug" }
];

export type InspectorTab = "inspector" | "debug" | "agent" | "sandbox" | "playground" | "audit";

export interface LogicFlowState {
  nodes: LogicFlowNodeData[];
  edges: LogicFlowEdgeData[];
  selectedNodeId: LogicFlowNodeId | null;
  activeNodeId: LogicFlowNodeId | null;
  activeEdgeId: string | null;
  liveFlowEnabled: boolean;
  inspectorTab: InspectorTab;
  events: PipelineEvent[];
  replaySpeed: number;
  replaying: boolean;
  explanation: string;
  explaining: boolean;
  panX: number;
  panY: number;
  zoom: number;
  selectNode: (id: LogicFlowNodeId) => void;
  setActiveNode: (id: LogicFlowNodeId | null) => void;
  setActiveEdge: (id: string | null) => void;
  setLiveFlow: (enabled: boolean) => void;
  setInspectorTab: (tab: InspectorTab) => void;
  setPipelineStep: (nodeId: LogicFlowNodeId, edgeId?: string | null) => void;
  pushEvent: (event: PipelineEvent) => void;
  clearEvents: () => void;
  handlePipelineEvent: (event: PipelineEvent) => void;
  setReplaySpeed: (speed: number) => void;
  setReplaying: (value: boolean) => void;
  setExplanation: (text: string) => void;
  setExplaining: (value: boolean) => void;
  resetView: () => void;
  centerView: () => void;
  syncFromComposerPhase: (phase: ComposerPhase | "running") => void;
}

const phaseToNode = (phase: ComposerPhase | "running"): LogicFlowNodeId | null => {
  if (phase === "awaiting_suggestions") return "suggestions";
  if (phase === "awaiting_review") return "review";
  if (phase === "running") return "composer";
  if (phase === "failed") return "debug";
  return null;
};

const applyNodeStatuses = (
  nodes: LogicFlowNodeData[],
  activeId: LogicFlowNodeId | null,
  phase: ComposerPhase | "running" | null
): LogicFlowNodeData[] => {
  if (phase === "completed") {
    return nodes.map((node) => ({ ...node, status: "done", active: false }));
  }
  if (phase === "failed" && activeId) {
    return nodes.map((node) => ({
      ...node,
      active: node.id === activeId,
      status: node.id === activeId ? "failed" : node.status === "done" ? "done" : "idle"
    }));
  }
  return nodes.map((node) => ({
    ...node,
    active: node.id === activeId,
    status: node.id === activeId ? "active" : node.status === "done" ? "done" : "idle"
  }));
};

const applyLiveStep = (
  get: () => LogicFlowState,
  set: (partial: Partial<LogicFlowState> | ((state: LogicFlowState) => Partial<LogicFlowState>)) => void,
  nodeId: LogicFlowNodeId,
  edgeId?: string | null
): void => {
  if (!get().liveFlowEnabled) return;
  const resolvedEdge = edgeId !== undefined ? edgeId : INCOMING_EDGE[nodeId];
  const { nodes } = get();
  set({
    activeNodeId: nodeId,
    activeEdgeId: resolvedEdge,
    selectedNodeId: nodeId,
    nodes: applyNodeStatuses(nodes, nodeId, null)
  });
};

export const useLogicFlowStore = create<LogicFlowState>((set, get) => ({
  nodes: DEFAULT_NODES.map((node) => ({ ...node })),
  edges: DEFAULT_EDGES.map((edge) => ({ ...edge })),
  selectedNodeId: null,
  activeNodeId: null,
  activeEdgeId: null,
  liveFlowEnabled: true,
  inspectorTab: "inspector",
  events: [],
  replaySpeed: 1,
  replaying: false,
  explanation: "",
  explaining: false,
  panX: 0,
  panY: 0,
  zoom: 1,

  selectNode: (id) => set({ selectedNodeId: id, explanation: "" }),

  setActiveNode: (id) => {
    if (!get().liveFlowEnabled) return;
    const edgeId = id ? INCOMING_EDGE[id] : null;
    const { nodes } = get();
    set({
      activeNodeId: id,
      activeEdgeId: edgeId,
      nodes: applyNodeStatuses(nodes, id, null)
    });
  },

  setActiveEdge: (id) => {
    if (!get().liveFlowEnabled) return;
    set({ activeEdgeId: id });
  },

  setLiveFlow: (enabled) => set({ liveFlowEnabled: enabled }),

  setInspectorTab: (tab) => set({ inspectorTab: tab }),

  setPipelineStep: (nodeId, edgeId) => {
    applyLiveStep(get, set, nodeId, edgeId);
  },

  pushEvent: (event) => set((state) => ({ events: [...state.events, event] })),

  clearEvents: () => set({ events: [] }),

  handlePipelineEvent: (event) => {
    get().pushEvent(event);

    if (event.type === "pipeline.start") {
      if (get().liveFlowEnabled) {
        set({
          events: [event],
          activeNodeId: null,
          activeEdgeId: null,
          inspectorTab: "inspector",
          nodes: DEFAULT_NODES.map((node) => ({ ...node, status: "idle", active: false }))
        });
      }
      return;
    }

    const live = get().liveFlowEnabled;

    if (event.type === "node.enter" && live) {
      applyLiveStep(get, set, event.nodeId);
    }
    if (event.type === "edge.activate" && live) {
      set({ activeEdgeId: event.edgeId });
    }
    if (event.type === "error.occurred") {
      set({ inspectorTab: "debug" });
      if (live) {
        applyLiveStep(get, set, event.nodeId ?? "debug", "e3");
      }
    }
    if (event.type === "tool.result" && !event.success) {
      set({ inspectorTab: "debug" });
    }
    if (event.type === "pipeline.finish" && live) {
      set({
        activeEdgeId: null,
        nodes: applyNodeStatuses(get().nodes, null, "completed")
      });
    }
  },

  setReplaySpeed: (speed) => set({ replaySpeed: speed }),

  setReplaying: (value) => set({ replaying: value }),

  setExplanation: (text) => set({ explanation: text }),

  setExplaining: (value) => set({ explaining: value }),

  resetView: () =>
    set({
      panX: 0,
      panY: 0,
      zoom: 1,
      selectedNodeId: null,
      explanation: "",
      activeNodeId: null,
      activeEdgeId: null,
      inspectorTab: "inspector",
      events: [],
      nodes: DEFAULT_NODES.map((node) => ({ ...node, status: "idle", active: false }))
    }),

  centerView: () => {
    const { nodes } = get();
    if (nodes.length === 0) return;
    const minX = Math.min(...nodes.map((node) => node.x));
    const maxX = Math.max(...nodes.map((node) => node.x));
    const minY = Math.min(...nodes.map((node) => node.y));
    const maxY = Math.max(...nodes.map((node) => node.y));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    set({ panX: -centerX + 400, panY: -centerY + 160, zoom: 1 });
  },

  syncFromComposerPhase: (phase) => {
    if (!get().liveFlowEnabled) return;
    if (phase === "completed") {
      set({
        activeNodeId: null,
        activeEdgeId: null,
        nodes: applyNodeStatuses(get().nodes, null, "completed")
      });
      return;
    }
    const activeId = phaseToNode(phase);
    if (!activeId) return;
    applyLiveStep(get, set, activeId, INCOMING_EDGE[activeId]);
    if (phase === "failed") {
      set({ inspectorTab: "debug", nodes: applyNodeStatuses(get().nodes, activeId, "failed") });
    }
  }
}));

let eventBusSubscribed = false;

export const ensureLogicFlowEventBusSubscription = (): void => {
  if (eventBusSubscribed) return;
  eventBusSubscribed = true;
  eventBus.on((event) => {
    useLogicFlowStore.getState().handlePipelineEvent(event);
  });
};

ensureLogicFlowEventBusSubscription();
