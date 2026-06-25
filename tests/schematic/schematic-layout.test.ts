import { describe, expect, it } from "vitest";
import { autoLayoutGraph } from "../../ai/schematic/schematic-layout";
import { createEmptyGraph, createNode } from "../../ai/schematic/schematic-types";

describe("schematic-layout", () => {
  it("assigns distinct positions via dagre", () => {
    const graph = createEmptyGraph("/workspace");
    graph.nodes = [
      createNode({ id: "a", type: "module", title: "A", position: { x: 0, y: 0 } }),
      createNode({ id: "b", type: "class", title: "B", position: { x: 0, y: 0 } }),
      createNode({ id: "c", type: "function", title: "C", position: { x: 0, y: 0 } }),
    ];
    graph.edges = [
      {
        id: "e1",
        source: "a",
        target: "b",
        type: "dependency",
        direction: "forward",
        weight: 1.5,
        glow: false,
        tooltip: "",
      },
      {
        id: "e2",
        source: "b",
        target: "c",
        type: "call",
        direction: "forward",
        weight: 1.5,
        glow: false,
        tooltip: "",
      },
    ];

    const layouted = autoLayoutGraph(graph);
    const positions = layouted.nodes.map((n) => `${n.position.x},${n.position.y}`);
    const unique = new Set(positions);
    expect(unique.size).toBeGreaterThan(1);
  });
});
