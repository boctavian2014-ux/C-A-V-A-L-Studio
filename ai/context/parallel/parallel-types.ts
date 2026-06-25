import type { DependencyEdge } from "../../../context-engine/dependency-graph";
import type { EmbeddingRecord, IndexedDocument } from "../../../context-engine/types";

export type ParallelTaskType = "file" | "embedding" | "symbols" | "dependencies" | "semantic";
export type ParallelPriority = "HIGH" | "MEDIUM" | "LOW";
export type ParallelTaskStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface ParallelCancellationToken {
  readonly id: string;
  readonly cancelled: boolean;
}

export interface ParallelTaskInput {
  taskId: string;
  type: ParallelTaskType;
  priority: ParallelPriority;
  workspaceRoot: string;
  filePath?: string;
  relativePath?: string;
  content?: string;
  batchIndex?: number;
  totalBatches?: number;
  createdAt: number;
  tokenId?: string;
}

export interface ContextSymbol {
  name: string;
  kind: "function" | "class" | "interface" | "type" | "const" | "export";
  file: string;
  line: number;
}

export interface SemanticSummary {
  file: string;
  tokens: number;
  lines: number;
  imports: number;
  exports: number;
  keywords: string[];
}

export interface ParallelTaskResult {
  taskId: string;
  type: ParallelTaskType;
  status: ParallelTaskStatus;
  durationMs: number;
  document?: IndexedDocument;
  embeddings?: EmbeddingRecord[];
  symbols?: ContextSymbol[];
  dependencies?: DependencyEdge[];
  semantic?: SemanticSummary;
  error?: string;
}

export interface ParallelLoadRequest {
  workspaceRoot: string;
  files: Array<{ path: string; content?: string }>;
  includeEmbeddings?: boolean;
  includeSymbols?: boolean;
  includeDependencies?: boolean;
  includeSemantic?: boolean;
  priority?: ParallelPriority;
  tokenId?: string;
}

export interface ParallelLoadResult {
  documents: IndexedDocument[];
  embeddings: EmbeddingRecord[];
  symbols: ContextSymbol[];
  dependencies: DependencyEdge[];
  semantics: SemanticSummary[];
  durationMs: number;
}

export interface ParallelWorkerRequest {
  requestId: string;
  task: ParallelTaskInput;
}

export interface ParallelWorkerResponse {
  requestId: string;
  result: ParallelTaskResult;
}

export interface ParallelSchedulerStats {
  queued: number;
  running: number;
  workers: number;
  completed: number;
  failed: number;
}

export const PARALLEL_LOG_PREFIX = "[CONTEXT:PARALLEL]";
