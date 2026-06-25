import type {
  SchematicAnalysisIssue,
  SchematicGraph,
  SchematicNode,
} from "./schematic-types";

const STRUCTURAL_EDGE_TYPES = new Set(["call", "dependency"]);

export function detectCircularDependencies(graph: SchematicGraph): SchematicAnalysisIssue[] {
  const adj = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (!STRUCTURAL_EDGE_TYPES.has(edge.type)) continue;
    const list = adj.get(edge.source) ?? [];
    list.push(edge.target);
    adj.set(edge.source, list);
  }

  const issues: SchematicAnalysisIssue[] = [];
  const visited = new Set<string>();
  const stack = new Set<string>();
  const path: string[] = [];

  const dfs = (nodeId: string): void => {
    if (stack.has(nodeId)) {
      const cycleStart = path.indexOf(nodeId);
      const cycle = path.slice(cycleStart);
      issues.push({
        id: `cycle-${cycle.join("-")}`,
        severity: "error",
        kind: "circular_dependency",
        message: `Circular dependency: ${cycle.map((id) => nodeLabel(graph, id)).join(" → ")}`,
        nodeIds: cycle,
      });
      return;
    }
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    stack.add(nodeId);
    path.push(nodeId);
    for (const next of adj.get(nodeId) ?? []) {
      dfs(next);
    }
    path.pop();
    stack.delete(nodeId);
  };

  for (const node of graph.nodes) {
    dfs(node.id);
  }

  return issues;
}

export function detectDeadNodes(graph: SchematicGraph): SchematicAnalysisIssue[] {
  const connected = new Set<string>();
  for (const edge of graph.edges) {
    connected.add(edge.source);
    connected.add(edge.target);
  }

  return graph.nodes
    .filter(
      (n) =>
        n.type !== "external_dependency" &&
        !connected.has(n.id) &&
        graph.nodes.length > 1
    )
    .map((n) => ({
      id: `dead-${n.id}`,
      severity: "warning" as const,
      kind: "dead_node" as const,
      message: `Dead node (no connections): ${n.title}`,
      nodeIds: [n.id],
    }));
}

export function detectInconsistentDataPaths(graph: SchematicGraph): SchematicAnalysisIssue[] {
  const issues: SchematicAnalysisIssue[] = [];
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));

  for (const edge of graph.edges) {
    if (edge.type !== "data_flow") continue;
    const target = nodeMap.get(edge.target);
    if (!target) continue;
    const hasInputPin = target.pins.some((p) => p.direction === "in");
    if (!hasInputPin) {
      issues.push({
        id: `data-path-${edge.id}`,
        severity: "warning",
        kind: "inconsistent_data_path",
        message: `Data flow to "${target.title}" has no input pin`,
        nodeIds: [target.id],
        edgeIds: [edge.id],
      });
    }
  }

  return issues;
}

export function analyzeSchematicGraph(graph: SchematicGraph): SchematicAnalysisIssue[] {
  return [
    ...detectCircularDependencies(graph),
    ...detectDeadNodes(graph),
    ...detectInconsistentDataPaths(graph),
  ];
}

function nodeLabel(graph: SchematicGraph, id: string): string {
  const node = graph.nodes.find((n) => n.id === id);
  return node?.title ?? id;
}
