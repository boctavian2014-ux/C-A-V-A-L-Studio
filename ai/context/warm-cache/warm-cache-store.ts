import type { EmbeddingRecord, IndexedDocument } from "../../../context-engine/types";
import type { ContextSymbol, ParallelLoadResult, SemanticSummary } from "../parallel/parallel-types";
import type { WarmCacheEntry, WarmCacheSnapshot } from "./warm-cache-types";

export class WarmCacheStore {
  private readonly entries = new Map<string, WarmCacheEntry>();

  upsertFromParallel(result: ParallelLoadResult): void {
    for (const document of result.documents) {
      const existing = this.entries.get(document.path);
      this.entries.set(document.path, {
        path: document.path,
        contentHash: document.contentHash,
        warmedAt: Date.now(),
        lastAccessed: Date.now(),
        document,
        embeddings: this.embeddingsFor(document, result.embeddings),
        symbols: result.symbols.filter((symbol) => symbol.file === document.path),
        dependencies: result.dependencies.filter((edge) => edge.from === document.path),
        semantic: result.semantics.find((semantic) => semantic.file === document.path) ?? existing?.semantic,
      });
    }
  }

  get(path: string): WarmCacheEntry | undefined {
    const entry = this.entries.get(path);
    if (entry) entry.lastAccessed = Date.now();
    return entry;
  }

  hasFresh(path: string, contentHash?: string): boolean {
    const entry = this.entries.get(path);
    if (!entry) return false;
    return !contentHash || entry.contentHash === contentHash;
  }

  invalidate(path: string): void {
    this.entries.delete(path);
  }

  invalidateByPrefix(prefix: string): void {
    for (const key of Array.from(this.entries.keys())) {
      if (key.startsWith(prefix)) this.entries.delete(key);
    }
  }

  clear(): void {
    this.entries.clear();
  }

  snapshot(): WarmCacheSnapshot {
    const entries = Array.from(this.entries.values());
    return {
      entries,
      warmedFiles: entries.length,
      embeddings: entries.reduce((sum, entry) => sum + entry.embeddings.length, 0),
      symbols: entries.reduce((sum, entry) => sum + entry.symbols.length, 0),
      dependencies: entries.reduce((sum, entry) => sum + entry.dependencies.length, 0),
    };
  }

  documents(): IndexedDocument[] {
    return this.snapshot().entries.flatMap((entry) => (entry.document ? [entry.document] : []));
  }

  symbols(): ContextSymbol[] {
    return this.snapshot().entries.flatMap((entry) => entry.symbols);
  }

  semantics(): SemanticSummary[] {
    return this.snapshot().entries.flatMap((entry) => (entry.semantic ? [entry.semantic] : []));
  }

  private embeddingsFor(document: IndexedDocument, embeddings: EmbeddingRecord[]): EmbeddingRecord[] {
    const ids = new Set(document.chunks.map((chunk) => chunk.id));
    return embeddings.filter((embedding) => ids.has(embedding.chunkId));
  }
}

export const warmCacheStore = new WarmCacheStore();
