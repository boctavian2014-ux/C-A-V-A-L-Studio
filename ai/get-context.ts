import { ContextEngineApi } from "../context-engine/api";
import { EmbeddingService } from "../context-engine/embeddings";
import type { DependencyEdge } from "../context-engine/dependency-graph";
import type { SemanticSearchResult } from "../context-engine/types";

export interface AIContextBundle {
  query: string;
  semanticResults: SemanticSearchResult[];
  dependencyGraph: DependencyEdge[];
  queryEmbedding: number[];
}

export class AIContextService {
  constructor(
    private readonly contextEngine = new ContextEngineApi(),
    private readonly embeddings = new EmbeddingService()
  ) {}

  async prepareWorkspace(rootDir: string): Promise<void> {
    const restored = await this.contextEngine.restoreWorkspace(rootDir);
    if (!restored) {
      await this.contextEngine.indexWorkspace(rootDir);
    }
  }

  async getContext(query: string, limit = 12): Promise<AIContextBundle> {
    const [embedding] = await this.embeddings.embedChunks([
      {
        id: "ai-query",
        documentId: "ai-query",
        text: query,
        startLine: 1,
        endLine: 1
      }
    ]);

    return {
      query,
      semanticResults: await this.contextEngine.search(query, limit),
      dependencyGraph: this.contextEngine.dependencies(),
      queryEmbedding: embedding.vector
    };
  }
}
