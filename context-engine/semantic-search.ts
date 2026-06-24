import { EmbeddingService } from "./embeddings";
import type { IndexedDocument, SemanticSearchResult } from "./types";
import { VectorDatabase } from "./vector-db";

export class SemanticSearchService {
  constructor(
    private readonly embeddings = new EmbeddingService(),
    private readonly vectorDb = new VectorDatabase()
  ) {}

  async index(documents: IndexedDocument[]): Promise<void> {
    const chunks = documents.flatMap((document) => document.chunks);
    const records = await this.embeddings.embedChunks(chunks);
    this.vectorDb.upsert(chunks, records);
  }

  async search(query: string, limit = 10): Promise<SemanticSearchResult[]> {
    const [queryEmbedding] = await this.embeddings.embedChunks([
      {
        id: "query",
        documentId: "query",
        text: query,
        startLine: 1,
        endLine: 1
      }
    ]);

    return this.vectorDb.search(queryEmbedding.vector, limit);
  }
}
