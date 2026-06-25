import { create } from "zustand";
import {
  type Node,
  type Edge,
  type Connection,
  type OnNodesChange,
  type OnEdgesChange,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from "@xyflow/react";
import type {
  SchematicAnalysisIssue,
  SchematicEdge,
  SchematicEdgeType,
  SchematicEditorMode,
  SchematicGraph,
  SchematicNode,
  SchematicNodeType,
  SchematicZoomLevel,
} from "./schematic-types";
import {
  SCHEMATIC_VERSION,
  colorForNodeType,
  computeGraphDelta,
  createEmptyGraph,
  createNode,
  defaultPinsForType,
} from "./schematic-types";
import {
  canRedo,
  canUndo,
  cloneGraph,
  createHistory,
  pushHistory,
  redo,
  undo,
  type SchematicHistoryState,
} from "./schematic-history";
import { analyzeSchematicGraph } from "./schematic-analysis";
import { autoLayoutGraph, filterGraphByZoomLevel } from "./schematic-layout";

export type SchematicFlowNode = Node<{
  schematicNode: SchematicNode;
}>;

export type SchematicFlowEdge = Edge<{
  schematicEdge: SchematicEdge;
}>;

let nodeCounter = 0;

function toFlowNode(node: SchematicNode): SchematicFlowNode {
  return {
    id: node.id,
    type: "schematicNode",
    position: node.position,
    data: { schematicNode: node },
  };
}

function toFlowEdge(edge: SchematicEdge): SchematicFlowEdge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    type: "schematicEdge",
    label: edge.tooltip || undefined,
    animated: edge.glow,
    data: { schematicEdge: edge },
  };
}

function fromFlowNodes(nodes: SchematicFlowNode[]): SchematicNode[] {
  return nodes.map((n) => ({
    ...n.data.schematicNode,
    position: n.position,
  }));
}

function fromFlowEdges(edges: SchematicFlowEdge[]): SchematicEdge[] {
  return edges.map((e) => ({
    ...e.data!.schematicEdge,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? undefined,
    targetHandle: e.targetHandle ?? undefined,
  }));
}

function buildGraph(
  workspaceRoot: string,
  flowNodes: SchematicFlowNode[],
  flowEdges: SchematicFlowEdge[],
  base?: SchematicGraph
): SchematicGraph {
  return {
    version: SCHEMATIC_VERSION,
    nodes: fromFlowNodes(flowNodes),
    edges: fromFlowEdges(flowEdges),
    groups: base?.groups ?? [],
    source: base?.source ?? { workspaceRoot, files: [] },
    updatedAt: Date.now(),
  };
}

interface SchematicStoreState {
  workspaceRoot: string;
  mode: SchematicEditorMode;
  zoomLevel: SchematicZoomLevel;
  nodes: SchematicFlowNode[];
  edges: SchematicFlowEdge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  history: SchematicHistoryState | null;
  syncedSnapshot: SchematicGraph | null;
  isDirty: boolean;
  issues: SchematicAnalysisIssue[];
  activeEdgeIds: Set<string>;
  aiExplanation: string | null;
  isAiActive: boolean;

  setWorkspaceRoot: (root: string) => void;
  loadGraph: (graph: SchematicGraph) => void;
  getGraph: () => SchematicGraph;
  getDelta: () => ReturnType<typeof computeGraphDelta>;
  setMode: (mode: SchematicEditorMode) => void;
  setZoomLevel: (level: SchematicZoomLevel) => void;
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  onNodesChange: OnNodesChange<SchematicFlowNode>;
  onEdgesChange: OnEdgesChange<SchematicFlowEdge>;
  onConnect: (connection: Connection) => void;
  addNode: (type: SchematicNodeType, title?: string) => void;
  deleteSelection: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  autoLayout: () => void;
  runAnalysis: () => void;
  setAiExplanation: (text: string | null) => void;
  setAiActive: (active: boolean) => void;
  pulseEdges: (edgeIds: string[]) => void;
  clearPulse: () => void;
  markSynced: () => void;
  reset: (workspaceRoot: string) => void;
}

function commitHistory(
  state: SchematicStoreState,
  nextNodes: SchematicFlowNode[],
  nextEdges: SchematicFlowEdge[]
): Partial<SchematicStoreState> {
  const graph = buildGraph(state.workspaceRoot, nextNodes, nextEdges, state.getGraph());
  const history = state.history
    ? pushHistory(state.history, graph)
    : createHistory(graph);
  const issues = analyzeSchematicGraph(graph);
  return {
    nodes: nextNodes,
    edges: nextEdges,
    history,
    isDirty: true,
    issues,
  };
}

export const useSchematicStore = create<SchematicStoreState>((set, get) => ({
  workspaceRoot: ".",
  mode: "select",
  zoomLevel: "function",
  nodes: [],
  edges: [],
  selectedNodeId: null,
  selectedEdgeId: null,
  history: null,
  syncedSnapshot: null,
  isDirty: false,
  issues: [],
  activeEdgeIds: new Set(),
  aiExplanation: null,
  isAiActive: false,

  setWorkspaceRoot: (root) => set({ workspaceRoot: root }),

  loadGraph: (graph) => {
    const layouted = autoLayoutGraph(graph);
    const nodes = layouted.nodes.map(toFlowNode);
    const edges = layouted.edges.map(toFlowEdge);
    const history = createHistory(layouted);
    const issues = analyzeSchematicGraph(layouted);
    set({
      nodes,
      edges,
      history,
      syncedSnapshot: cloneGraph(layouted),
      isDirty: false,
      issues,
      workspaceRoot: layouted.source.workspaceRoot,
    });
  },

  getGraph: () => {
    const s = get();
    return buildGraph(s.workspaceRoot, s.nodes, s.edges, s.syncedSnapshot ?? undefined);
  },

  getDelta: () => {
    const s = get();
    const current = s.getGraph();
    const before = s.syncedSnapshot ?? createEmptyGraph(s.workspaceRoot);
    return computeGraphDelta(before, current);
  },

  setMode: (mode) => set({ mode }),
  setZoomLevel: (level) => {
    const s = get();
    const full = s.getGraph();
    const filtered = filterGraphByZoomLevel(full, level);
    set({
      zoomLevel: level,
      nodes: filtered.nodes.map(toFlowNode),
      edges: filtered.edges.map(toFlowEdge),
    });
  },

  selectNode: (id) => set({ selectedNodeId: id, selectedEdgeId: null }),
  selectEdge: (id) => set({ selectedEdgeId: id, selectedNodeId: null }),

  onNodesChange: (changes) => {
    const s = get();
    const nextNodes = applyNodeChanges(changes, s.nodes);
    const moved = changes.some((c) => c.type === "position" && c.dragging === false);
    if (moved) {
      set(commitHistory(s, nextNodes, s.edges));
    } else {
      set({ nodes: nextNodes });
    }
  },

  onEdgesChange: (changes) => {
    const s = get();
    const nextEdges = applyEdgeChanges(changes, s.edges);
    if (changes.some((c) => c.type === "remove")) {
      set(commitHistory(s, s.nodes, nextEdges));
    } else {
      set({ edges: nextEdges });
    }
  },

  onConnect: (connection) => {
    const s = get();
    if (s.mode !== "connect") return;
    const edgeId = `edge-${Date.now()}`;
    const schematicEdge: SchematicEdge = {
      id: edgeId,
      source: connection.source!,
      target: connection.target!,
      sourceHandle: connection.sourceHandle ?? undefined,
      targetHandle: connection.targetHandle ?? undefined,
      type: "call",
      direction: "forward",
      weight: 1.5,
      glow: false,
      tooltip: "",
    };
    const flowEdge = toFlowEdge(schematicEdge);
    const nextEdges = addEdge(flowEdge, s.edges) as SchematicFlowEdge[];
    set(commitHistory(s, s.nodes, nextEdges));
  },

  addNode: (type, title) => {
    const s = get();
    nodeCounter += 1;
    const id = `node-${type}-${nodeCounter}`;
    const schematicNode = createNode({
      id,
      type,
      title: title ?? `New ${type}`,
      position: { x: 80 + nodeCounter * 24, y: 80 + nodeCounter * 16 },
      pins: defaultPinsForType(type),
      metadata: { zoomLevel: s.zoomLevel },
      color: colorForNodeType(type),
    });
    const nextNodes = [...s.nodes, toFlowNode(schematicNode)];
    set(commitHistory(s, nextNodes, s.edges));
    set({ selectedNodeId: id });
  },

  deleteSelection: () => {
    const s = get();
    const { selectedNodeId, selectedEdgeId } = s;
    if (!selectedNodeId && !selectedEdgeId) return;

    let nextNodes = s.nodes;
    let nextEdges = s.edges;

    if (selectedNodeId) {
      nextNodes = s.nodes.filter((n) => n.id !== selectedNodeId);
      nextEdges = s.edges.filter(
        (e) => e.source !== selectedNodeId && e.target !== selectedNodeId
      );
    } else if (selectedEdgeId) {
      nextEdges = s.edges.filter((e) => e.id !== selectedEdgeId);
    }

    set({
      ...commitHistory(s, nextNodes, nextEdges),
      selectedNodeId: null,
      selectedEdgeId: null,
    });
  },

  undo: () => {
    const s = get();
    if (!s.history) return;
    const prev = undo(s.history);
    if (!prev) return;
    set({
      history: prev,
      nodes: prev.present.nodes.map(toFlowNode),
      edges: prev.present.edges.map(toFlowEdge),
      isDirty: true,
      issues: analyzeSchematicGraph(prev.present),
    });
  },

  redo: () => {
    const s = get();
    if (!s.history) return;
    const next = redo(s.history);
    if (!next) return;
    set({
      history: next,
      nodes: next.present.nodes.map(toFlowNode),
      edges: next.present.edges.map(toFlowEdge),
      isDirty: true,
      issues: analyzeSchematicGraph(next.present),
    });
  },

  canUndo: () => {
    const h = get().history;
    return h ? canUndo(h) : false;
  },

  canRedo: () => {
    const h = get().history;
    return h ? canRedo(h) : false;
  },

  autoLayout: () => {
    const s = get();
    const layouted = autoLayoutGraph(s.getGraph());
    set({
      ...commitHistory(
        s,
        layouted.nodes.map(toFlowNode),
        layouted.edges.map(toFlowEdge)
      ),
      nodes: layouted.nodes.map(toFlowNode),
      edges: layouted.edges.map(toFlowEdge),
    });
  },

  runAnalysis: () => {
    set({ issues: analyzeSchematicGraph(get().getGraph()) });
  },

  setAiExplanation: (text) => set({ aiExplanation: text }),
  setAiActive: (active) => set({ isAiActive: active }),
  pulseEdges: (edgeIds) => set({ activeEdgeIds: new Set(edgeIds) }),
  clearPulse: () => set({ activeEdgeIds: new Set() }),

  markSynced: () => {
    const graph = get().getGraph();
    set({ syncedSnapshot: cloneGraph(graph), isDirty: false });
  },

  reset: (workspaceRoot) => {
    const empty = createEmptyGraph(workspaceRoot);
    set({
      workspaceRoot,
      nodes: [],
      edges: [],
      history: createHistory(empty),
      syncedSnapshot: cloneGraph(empty),
      isDirty: false,
      issues: [],
      selectedNodeId: null,
      selectedEdgeId: null,
      aiExplanation: null,
    });
  },
}));

export function edgeTypeForConnect(mode: SchematicEditorMode): SchematicEdgeType {
  return mode === "connect" ? "call" : "dependency";
}
