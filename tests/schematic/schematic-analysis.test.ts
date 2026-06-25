import { describe, expect, it } from "vitest";
import { analyzeSchematicGraph } from "../../ai/schematic/schematic-analysis";
import { createEmptyGraph, createNode } from "../../ai/schematic/schematic-types";

describe("schematic-analysis", () => {
  it("detects circular dependencies", () => {
    const graph = createEmptyGraph("/w");
    graph.nodes = [
      createNode({ id: "a", type: "function", title: "A" }),
      createNode({ id: "b", type: "function", title: "B" }),
    ];
    graph.edges = [
      { id: "e1", source: "a", target: "b", type: "call", direction: "forward", weight: 1, glow: false, tooltip: "" },
      { id: "e2", source: "b", target: "a", type: "dependency", direction: "forward", weight: 1, glow: false, tooltip: "" },
    ];

    const issues = analyzeSchematicGraph(graph);
    expect(issues.some((i) => i.kind === "circular_dependency")).toBe(true);
  });

  it("detects dead nodes", () => {
    const graph = createEmptyGraph("/w");
    graph.nodes = [
      createNode({ id: "a", type: "function", title: "Connected" }),
      createNode({ id: "b", type: "function", title: "Orphan" }),
    ];
    graph.edges = [
      { id: "e1", source: "a", target: "a", type: "call", direction: "forward", weight: 1, glow: false, tooltip: "self" },
    ];

    const issues = analyzeSchematicGraph(graph);
    expect(issues.some((i) => i.kind === "dead_node" && i.nodeIds?.includes("b"))).toBe(true);
  });
});
