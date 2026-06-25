import { describe, expect, it } from "vitest";
import {
  colorForNodeType,
  createNode,
  validateSchematicGraph,
  computeGraphDelta,
  createEmptyGraph,
  SCHEMATIC_VERSION,
} from "../../ai/schematic/schematic-types";

describe("schematic-types", () => {
  it("assigns colors per node type", () => {
    expect(colorForNodeType("function")).toBe("#00e0ff");
    expect(colorForNodeType("ai_agent")).toBe("#c678dd");
  });

  it("creates nodes with default pins", () => {
    const node = createNode({ id: "n1", type: "api_endpoint", title: "GET /api" });
    expect(node.pins.length).toBeGreaterThanOrEqual(2);
    expect(node.color).toBe(colorForNodeType("api_endpoint"));
  });

  it("validates schematic graph schema", () => {
    const graph = createEmptyGraph("/workspace");
    expect(validateSchematicGraph(graph)).toBe(true);
    expect(graph.version).toBe(SCHEMATIC_VERSION);
  });

  it("computes graph delta", () => {
    const before = createEmptyGraph("/w");
    const after = createEmptyGraph("/w");
    const added = createNode({ id: "a", type: "function", title: "foo" });
    after.nodes.push(added);

    const delta = computeGraphDelta(before, after);
    expect(delta.addedNodes).toHaveLength(1);
    expect(delta.addedNodes[0]!.id).toBe("a");
  });
});
