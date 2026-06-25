import type { DependencyEdge } from "../../../context-engine/dependency-graph";
import type { EmbeddingRecord, IndexedDocument } from "../../../context-engine/types";
import type { ContextSymbol, SemanticSummary } from "../parallel/parallel-types";

export type WarmCacheReason =
  | "startup"
  | "project-change"
  | "file-open"
  | "file-change"
  | "pipeline"
  | "predictive"
  | "manual";

export interface WarmCacheEntry {
  path: string;
  contentHash: string;
  warmedAt: number;
  lastAccessed: number;
  document?: IndexedDocument;
  embeddings: EmbeddingRecord[];
  symbols: ContextSymbol[];
  dependencies: DependencyEdge[];
  semantic?: SemanticSummary;
}

export interface WarmCacheRequest {
  workspaceRoot: string;
  files?: Array<{ path: string; content?: string }>;
  activeFile?: string;
  reason: WarmCacheReason;
  tokenId?: string;
}

export interface WarmCacheSnapshot {
  entries: WarmCacheEntry[];
  warmedFiles: number;
  embeddings: number;
  symbols: number;
  dependencies: number;
}

export interface WarmCachePrediction {
  files: string[];
  reason: WarmCacheReason;
  confidence: number;
}

export const WARM_CACHE_LOG_PREFIX = "[CONTEXT:WARM]";
