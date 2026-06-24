import { DependencyGraph, type DependencyEdge } from "./dependency-graph";
import { ProjectIndexer } from "./indexer";
import { LocalContextCache } from "./local-cache";
import { SemanticSearchService } from "./semantic-search";
import type { IndexedDocument, SemanticSearchResult } from "./types";

export class ContextEngineApi {
  private documents: IndexedDocument[] = [];

  constructor(
    private readonly indexer = new ProjectIndexer(),
    private readonly semanticSearch = new SemanticSearchService(),
    private readonly dependencyGraph = new DependencyGraph(),
    private readonly cache = new LocalContextCache()
  ) {}

  async indexWorkspace(rootDir: string): Promise<IndexedDocument[]> {
    this.documents = await this.indexer.scanProject(rootDir);
    await this.semanticSearch.index(this.documents);
    await this.cache.write(rootDir, this.documents);
    return this.documents;
  }

  async restoreWorkspace(rootDir: string): Promise<IndexedDocument[] | null> {
    this.documents = await this.cache.read(rootDir) ?? [];
    if (this.documents.length === 0) {
      return null;
    }

    await this.semanticSearch.index(this.documents);
    return this.documents;
  }

  search(query: string, limit?: number): Promise<SemanticSearchResult[]> {
    return this.semanticSearch.search(query, limit);
  }

  dependencies(): DependencyEdge[] {
    return this.dependencyGraph.build(this.documents);
  }
}
