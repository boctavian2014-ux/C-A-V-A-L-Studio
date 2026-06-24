export interface IndexedDocument {
  id: string;
  path: string;
  language: string;
  contentHash: string;
  chunks: ContextChunk[];
}

export interface ContextChunk {
  id: string;
  documentId: string;
  path?: string;
  text: string;
  startLine: number;
  endLine: number;
}

export interface EmbeddingRecord {
  chunkId: string;
  vector: number[];
  model: string;
}

export interface SemanticSearchResult {
  chunk: ContextChunk;
  score: number;
}
