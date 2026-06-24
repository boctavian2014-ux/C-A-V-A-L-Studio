import { describe, expect, it } from "vitest";
import { SemanticSearchService } from "../../context-engine/semantic-search";

describe("SemanticSearchService", () => {
  it("indexes documents and returns ranked search results", async () => {
    const service = new SemanticSearchService();
    await service.index([
      {
        id: "doc-a",
        path: "src/auth.ts",
        language: "ts",
        contentHash: "a",
        chunks: [{
          id: "c1",
          documentId: "doc-a",
          path: "src/auth.ts",
          text: "authenticate user with jwt token",
          startLine: 1,
          endLine: 1
        }]
      },
      {
        id: "doc-b",
        path: "src/styles.css",
        language: "css",
        contentHash: "b",
        chunks: [{
          id: "c2",
          documentId: "doc-b",
          path: "src/styles.css",
          text: "button color primary",
          startLine: 1,
          endLine: 1
        }]
      }
    ]);

    const results = await service.search("jwt authentication");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].chunk.path).toBe("src/auth.ts");
  });
});
