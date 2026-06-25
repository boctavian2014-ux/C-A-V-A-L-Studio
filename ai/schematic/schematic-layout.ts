import dagre from "dagre";
import type { SchematicGraph, SchematicNode, SchematicZoomLevel } from "./schematic-types";

const NODE_WIDTH = 200;
const NODE_HEIGHT = 72;

export interface LayoutOptions {
  direction?: "TB" | "LR";
  nodeSep?: number;
  rankSep?: number;
}

export function applyDagreLayout(
  graph: SchematicGraph,
  options: LayoutOptions = {}
): SchematicGraph {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: options.direction ?? "LR",
    nodesep: options.nodeSep ?? 60,
    ranksep: options.rankSep ?? 80,
    marginx: 40,
    marginy: 40,
  });

  for (const node of graph.nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  for (const edge of graph.edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const nodes: SchematicNode[] = graph.nodes.map((node) => {
    const positioned = g.node(node.id);
    if (!positioned) return node;
    return {
      ...node,
      position: {
        x: positioned.x - NODE_WIDTH / 2,
        y: positioned.y - NODE_HEIGHT / 2,
      },
    };
  });

  return {
    ...graph,
    nodes,
    updatedAt: Date.now(),
  };
}

export function filterGraphByZoomLevel(
  graph: SchematicGraph,
  zoomLevel: SchematicZoomLevel
): SchematicGraph {
  const visibleIds = new Set(
    graph.nodes
      .filter((n) => n.metadata.zoomLevel === zoomLevel)
      .map((n) => n.id)
  );

  if (visibleIds.size === 0) {
    return graph;
  }

  return {
    ...graph,
    nodes: graph.nodes.filter((n) => visibleIds.has(n.id)),
    edges: graph.edges.filter(
      (e) => visibleIds.has(e.source) && visibleIds.has(e.target)
    ),
    groups: graph.groups.filter((g) => g.zoomLevel === zoomLevel),
  };
}

export function groupNodesByZoomLevel(graph: SchematicGraph): SchematicGraph {
  const levels: SchematicZoomLevel[] = ["module", "class", "function"];
  const groups = levels
    .map((level) => {
      const nodeIds = graph.nodes
        .filter((n) => n.metadata.zoomLevel === level)
        .map((n) => n.id);
      if (nodeIds.length === 0) return null;
      return {
        id: `group-${level}`,
        label: level.charAt(0).toUpperCase() + level.slice(1),
        nodeIds,
        zoomLevel: level,
      };
    })
    .filter((g): g is NonNullable<typeof g> => g != null);

  return { ...graph, groups };
}

export function autoLayoutGraph(graph: SchematicGraph): SchematicGraph {
  const grouped = groupNodesByZoomLevel(graph);
  return applyDagreLayout(grouped);
}
