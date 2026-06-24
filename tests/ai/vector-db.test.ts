import { describe, expect, it } from "vitest";
import { VectorDatabase } from "../../context-engine/vector-db";

describe("VectorDatabase", () => {
  it("ranks identical vectors highest", () => {
    const db = new VectorDatabase();
    const vector = [1, 0, 0];
    db.upsert(
      [
        { id: "c1", documentId: "d1", path: "a.ts", text: "alpha", startLine: 1, endLine: 1 },
        { id: "c2", documentId: "d1", path: "b.ts", text: "beta", startLine: 1, endLine: 1 }
      ],
      [
        { chunkId: "c1", vector, model: "test" },
        { chunkId: "c2", vector: [0, 1, 0], model: "test" }
      ]
    );
    const results = db.search(vector, 2);
    expect(results[0].chunk.id).toBe("c1");
    expect(results[0].score).toBeCloseTo(1, 5);
  });

  it("returns empty when no embeddings stored", () => {
    const db = new VectorDatabase();
    expect(db.search([1, 0], 5)).toEqual([]);
  });
});
