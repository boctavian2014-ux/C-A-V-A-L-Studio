import { describe, expect, it } from "vitest";
import { createSampleGraph } from "../../ai/schematic/schematic-ai";
import { validateSchematicGraph } from "../../ai/schematic/schematic-types";

describe("schematic-ai sample graph", () => {
  it("creates valid sample graph", () => {
    const graph = createSampleGraph("/workspace");
    expect(validateSchematicGraph(graph)).toBe(true);
    expect(graph.nodes.length).toBeGreaterThanOrEqual(4);
    expect(graph.edges.length).toBeGreaterThanOrEqual(3);
  });
});
