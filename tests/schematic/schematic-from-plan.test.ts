import { describe, expect, it } from "vitest";
import { graphFromHardwarePlan } from "../../ai/schematic/schematic-ai";
import { validateSchematicGraph } from "../../ai/schematic/schematic-types";

describe("schematic-from-plan", () => {
  it("builds FPV drone hardware graph with nodes and edges", () => {
    const graph = graphFromHardwarePlan({
      workspaceRoot: "/tmp/project",
      projectType: "drone",
      objective: "FPV quad 5 inch",
      planContext: {
        requirements: "5 inch racing quad, 4S",
        components: "2207 motors, FC, ESC, VTX",
      },
    });
    expect(validateSchematicGraph(graph)).toBe(true);
    expect(graph.nodes.length).toBeGreaterThan(4);
    expect(graph.edges.length).toBeGreaterThan(3);
    expect(graph.nodes.some((n) => n.title.includes("Battery"))).toBe(true);
    expect(graph.nodes.some((n) => n.title.includes("Flight Controller"))).toBe(true);
  });
});
