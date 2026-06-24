import { describe, expect, it } from "vitest";
import { DeterministicEmbeddingProvider, EmbeddingService } from "../../context-engine/embeddings";

describe("EmbeddingService", () => {
  it("produces deterministic vectors of length 32", async () => {
    const provider = new DeterministicEmbeddingProvider();
    const first = await provider.embed("hello world");
    const second = await provider.embed("hello world");
    expect(first).toHaveLength(32);
    expect(first).toEqual(second);
  });

  it("embedChunks maps chunk ids to vectors", async () => {
    const service = new EmbeddingService();
    const records = await service.embedChunks([
      {
        id: "chunk-1",
        documentId: "doc-1",
        path: "src/a.ts",
        text: "export const a = 1;",
        startLine: 1,
        endLine: 1
      }
    ]);
    expect(records[0].chunkId).toBe("chunk-1");
    expect(records[0].vector).toHaveLength(32);
  });
});
