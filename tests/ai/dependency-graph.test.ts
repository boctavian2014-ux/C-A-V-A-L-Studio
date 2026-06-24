import { describe, expect, it } from "vitest";
import { DependencyGraph } from "../../context-engine/dependency-graph";

describe("DependencyGraph", () => {
  it("extracts import edges from indexed documents", () => {
    const graph = new DependencyGraph();
    const edges = graph.build([
      {
        id: "doc1",
        path: "src/main.ts",
        language: "ts",
        contentHash: "x",
        chunks: [{
          id: "c1",
          documentId: "doc1",
          path: "src/main.ts",
          text: 'import { helper } from "./helper";\nconst x = require("./legacy");',
          startLine: 1,
          endLine: 2
        }]
      }
    ]);
    expect(edges).toHaveLength(2);
    expect(edges[0].kind).toBe("import");
    expect(edges[1].kind).toBe("require");
    expect(edges[0].to.replace(/\\/g, "/")).toContain("helper");
  });

  it("preserves package imports as-is", () => {
    const edges = new DependencyGraph().build([
      {
        id: "doc2",
        path: "src/app.ts",
        language: "ts",
        contentHash: "y",
        chunks: [{
          id: "c2",
          documentId: "doc2",
          path: "src/app.ts",
          text: 'import express from "express";',
          startLine: 1,
          endLine: 1
        }]
      }
    ]);
    expect(edges[0].to).toBe("express");
  });
});
