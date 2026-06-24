import type { ContextChunk, EmbeddingRecord, SemanticSearchResult } from "./types";

export class VectorDatabase {
  private readonly chunks = new Map<string, ContextChunk>();
  private readonly embeddings = new Map<string, EmbeddingRecord>();

  upsert(chunks: ContextChunk[], embeddings: EmbeddingRecord[]): void {
    for (const chunk of chunks) {
      this.chunks.set(chunk.id, chunk);
    }

    for (const embedding of embeddings) {
      this.embeddings.set(embedding.chunkId, embedding);
    }
  }

  search(queryVector: number[], limit = 10): SemanticSearchResult[] {
    return [...this.embeddings.values()]
      .map((embedding) => ({
        embedding,
        score: this.cosineSimilarity(queryVector, embedding.vector)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .flatMap(({ embedding, score }) => {
        const chunk = this.chunks.get(embedding.chunkId);
        return chunk ? [{ chunk, score }] : [];
      });
  }

  private cosineSimilarity(left: number[], right: number[]): number {
    const length = Math.min(left.length, right.length);
    let dot = 0;
    let leftNorm = 0;
    let rightNorm = 0;

    for (let index = 0; index < length; index += 1) {
      dot += left[index] * right[index];
      leftNorm += left[index] ** 2;
      rightNorm += right[index] ** 2;
    }

    if (leftNorm === 0 || rightNorm === 0) {
      return 0;
    }

    return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
  }
}
