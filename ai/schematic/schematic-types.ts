/** CAVALLO Studio Schematic Editor — core data model */

export const SCHEMATIC_VERSION = "caval-schematic-v1" as const;

export type SchematicNodeType =
  | "function"
  | "class"
  | "module"
  | "api_endpoint"
  | "state"
  | "event"
  | "data_structure"
  | "ai_agent"
  | "external_dependency";

export type SchematicEdgeType =
  | "call"
  | "data_flow"
  | "dependency"
  | "event"
  | "ai_reasoning";

export type SchematicZoomLevel = "module" | "class" | "function";

export type SchematicEditorMode = "select" | "connect" | "edit";

export interface SchematicPin {
  id: string;
  label: string;
  direction: "in" | "out";
}

export interface SchematicNodeMetadata {
  sourceFile?: string;
  symbolId?: string;
  lineRange?: [number, number];
  aiNotes?: string;
  zoomLevel: SchematicZoomLevel;
}

export interface SchematicNode {
  id: string;
  type: SchematicNodeType;
  title: string;
  description: string;
  position: { x: number; y: number };
  pins: SchematicPin[];
  metadata: SchematicNodeMetadata;
  color: string;
}

export interface SchematicEdgeMetadata {
  risk?: "low" | "medium" | "high";
}

export interface SchematicEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  type: SchematicEdgeType;
  direction: "forward" | "bidirectional";
  weight: number;
  glow: boolean;
  tooltip: string;
  metadata?: SchematicEdgeMetadata;
}

export interface SchematicGroup {
  id: string;
  label: string;
  nodeIds: string[];
  zoomLevel: SchematicZoomLevel;
}

export interface SchematicGraphSource {
  workspaceRoot: string;
  files: string[];
}

export interface SchematicGraph {
  version: typeof SCHEMATIC_VERSION;
  nodes: SchematicNode[];
  edges: SchematicEdge[];
  groups: SchematicGroup[];
  source: SchematicGraphSource;
  updatedAt?: number;
}

export interface SchematicGraphDelta {
  addedNodes: SchematicNode[];
  removedNodeIds: string[];
  updatedNodes: SchematicNode[];
  addedEdges: SchematicEdge[];
  removedEdgeIds: string[];
  updatedEdges: SchematicEdge[];
}

export interface SchematicAnalysisIssue {
  id: string;
  severity: "info" | "warning" | "error";
  kind: "circular_dependency" | "dead_node" | "inconsistent_data_path" | "architecture";
  message: string;
  nodeIds?: string[];
  edgeIds?: string[];
}

export const NODE_TYPE_COLORS: Record<SchematicNodeType, string> = {
  function: "#00e0ff",
  class: "#a78bfa",
  module: "#34d399",
  api_endpoint: "#fbbf24",
  state: "#f472b6",
  event: "#fb923c",
  data_structure: "#60a5fa",
  ai_agent: "#c678dd",
  external_dependency: "#94a3b8",
};

export const NODE_TYPE_LABELS: Record<SchematicNodeType, string> = {
  function: "Function",
  class: "Class",
  module: "Module",
  api_endpoint: "API Endpoint",
  state: "State",
  event: "Event",
  data_structure: "Data Structure",
  ai_agent: "AI Agent",
  external_dependency: "External Dependency",
};

export function colorForNodeType(type: SchematicNodeType): string {
  return NODE_TYPE_COLORS[type] ?? "#00e0ff";
}

export function defaultPinsForType(type: SchematicNodeType): SchematicPin[] {
  const inPin = (label: string): SchematicPin => ({
    id: `in-${label.toLowerCase().replace(/\s+/g, "-")}`,
    label,
    direction: "in",
  });
  const outPin = (label: string): SchematicPin => ({
    id: `out-${label.toLowerCase().replace(/\s+/g, "-")}`,
    label,
    direction: "out",
  });

  switch (type) {
    case "api_endpoint":
      return [inPin("request"), outPin("response")];
    case "event":
      return [outPin("emit")];
    case "state":
      return [inPin("set"), outPin("get")];
    case "ai_agent":
      return [inPin("context"), inPin("tools"), outPin("result")];
    case "external_dependency":
      return [outPin("export")];
    default:
      return [inPin("in"), outPin("out")];
  }
}

export function createEmptyGraph(workspaceRoot: string): SchematicGraph {
  return {
    version: SCHEMATIC_VERSION,
    nodes: [],
    edges: [],
    groups: [],
    source: { workspaceRoot, files: [] },
    updatedAt: Date.now(),
  };
}

export function createNode(
  partial: Pick<SchematicNode, "id" | "type" | "title"> &
    Partial<Omit<SchematicNode, "id" | "type" | "title">>
): SchematicNode {
  const type = partial.type;
  return {
    id: partial.id,
    type,
    title: partial.title,
    description: partial.description ?? "",
    position: partial.position ?? { x: 0, y: 0 },
    pins: partial.pins ?? defaultPinsForType(type),
    metadata: partial.metadata ?? { zoomLevel: "function" },
    color: partial.color ?? colorForNodeType(type),
  };
}

export function validateSchematicGraph(data: unknown): data is SchematicGraph {
  if (!data || typeof data !== "object") return false;
  const g = data as SchematicGraph;
  return (
    g.version === SCHEMATIC_VERSION &&
    Array.isArray(g.nodes) &&
    Array.isArray(g.edges) &&
    Array.isArray(g.groups) &&
    g.source != null &&
    typeof g.source.workspaceRoot === "string"
  );
}

export function computeGraphDelta(
  before: SchematicGraph,
  after: SchematicGraph
): SchematicGraphDelta {
  const beforeNodeIds = new Set(before.nodes.map((n) => n.id));
  const afterNodeIds = new Set(after.nodes.map((n) => n.id));
  const beforeEdgeIds = new Set(before.edges.map((e) => e.id));
  const afterEdgeIds = new Set(after.edges.map((e) => e.id));

  const afterNodeMap = new Map(after.nodes.map((n) => [n.id, n]));
  const beforeNodeMap = new Map(before.nodes.map((n) => [n.id, n]));
  const afterEdgeMap = new Map(after.edges.map((e) => [e.id, e]));
  const beforeEdgeMap = new Map(before.edges.map((e) => [e.id, e]));

  return {
    addedNodes: after.nodes.filter((n) => !beforeNodeIds.has(n.id)),
    removedNodeIds: before.nodes.filter((n) => !afterNodeIds.has(n.id)).map((n) => n.id),
    updatedNodes: after.nodes.filter((n) => {
      const prev = beforeNodeMap.get(n.id);
      return prev != null && JSON.stringify(prev) !== JSON.stringify(n);
    }),
    addedEdges: after.edges.filter((e) => !beforeEdgeIds.has(e.id)),
    removedEdgeIds: before.edges.filter((e) => !afterEdgeIds.has(e.id)).map((e) => e.id),
    updatedEdges: after.edges.filter((e) => {
      const prev = beforeEdgeMap.get(e.id);
      return prev != null && JSON.stringify(prev) !== JSON.stringify(e);
    }),
  };
}
