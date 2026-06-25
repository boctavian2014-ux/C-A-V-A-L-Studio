import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { parentPort } from "node:worker_threads";

import type { DependencyEdge } from "../../../context-engine/dependency-graph";
import type { ContextChunk, EmbeddingRecord, IndexedDocument } from "../../../context-engine/types";
import type {
  ContextSymbol,
  ParallelTaskInput,
  ParallelTaskResult,
  ParallelWorkerRequest,
  ParallelWorkerResponse,
  SemanticSummary,
} from "./parallel-types";

function hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function chunksFor(documentId: string, relativePath: string, content: string, size = 80): ContextChunk[] {
  const lines = content.split(/\r?\n/);
  const chunks: ContextChunk[] = [];
  for (let index = 0; index < lines.length; index += size) {
    const slice = lines.slice(index, index + size);
    chunks.push({
      id: `${documentId}:${index + 1}`,
      documentId,
      path: relativePath,
      text: slice.join("\n"),
      startLine: index + 1,
      endLine: index + slice.length,
    });
  }
  return chunks;
}

function deterministicEmbedding(text: string): number[] {
  const digest = crypto.createHash("sha256").update(text).digest();
  return Array.from({ length: 32 }, (_, index) => digest[index] / 255);
}

async function contentFor(task: ParallelTaskInput): Promise<string> {
  if (task.content !== undefined) return task.content;
  if (!task.filePath) return "";
  return fs.readFile(task.filePath, "utf8");
}

async function indexFile(task: ParallelTaskInput): Promise<IndexedDocument> {
  const content = await contentFor(task);
  const relativePath = task.relativePath ?? (task.filePath ? path.relative(task.workspaceRoot, task.filePath) : "unknown");
  const id = hash(relativePath);
  return {
    id,
    path: relativePath,
    language: path.extname(relativePath).replace(".", "") || "text",
    contentHash: hash(content),
    chunks: chunksFor(id, relativePath, content),
  };
}

async function embed(task: ParallelTaskInput): Promise<EmbeddingRecord[]> {
  const document = await indexFile(task);
  return document.chunks.map((chunk) => ({
    chunkId: chunk.id,
    vector: deterministicEmbedding(chunk.text),
    model: "caval-local-deterministic-v1",
  }));
}

async function symbols(task: ParallelTaskInput): Promise<ContextSymbol[]> {
  const content = await contentFor(task);
  const relativePath = task.relativePath ?? task.filePath ?? "unknown";
  const results: ContextSymbol[] = [];
  const lines = content.split(/\r?\n/);
  const regex =
    /\b(export\s+)?(async\s+)?(function|class|interface|type|const)\s+([A-Za-z_$][\w$]*)/;

  lines.forEach((line, index) => {
    const match = regex.exec(line);
    if (!match) return;
    const keyword = match[3] as ContextSymbol["kind"];
    results.push({
      name: match[4],
      kind: keyword,
      file: relativePath,
      line: index + 1,
    });
  });
  return results;
}

async function dependencies(task: ParallelTaskInput): Promise<DependencyEdge[]> {
  const content = await contentFor(task);
  const relativePath = task.relativePath ?? task.filePath ?? "unknown";
  const edges: DependencyEdge[] = [];
  const importRegex = /import\s+(?:.+?\s+from\s+)?["'](.+?)["']|require\(["'](.+?)["']\)/g;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(content)) !== null) {
    const target = match[1] ?? match[2];
    edges.push({
      from: relativePath,
      to: target.startsWith(".") ? path.normalize(path.join(path.dirname(relativePath), target)) : target,
      kind: match[1] ? "import" : "require",
    });
  }
  return edges;
}

async function semantic(task: ParallelTaskInput): Promise<SemanticSummary> {
  const content = await contentFor(task);
  const relativePath = task.relativePath ?? task.filePath ?? "unknown";
  const words = content.toLowerCase().match(/[a-z_][a-z0-9_]{2,}/g) ?? [];
  const counts = new Map<string, number>();
  for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
  const keywords = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([word]) => word);
  return {
    file: relativePath,
    tokens: words.length,
    lines: content.split(/\r?\n/).length,
    imports: (content.match(/\bimport\b/g) ?? []).length,
    exports: (content.match(/\bexport\b/g) ?? []).length,
    keywords,
  };
}

async function runTask(task: ParallelTaskInput): Promise<ParallelTaskResult> {
  const startedAt = Date.now();
  try {
    if (task.type === "file") {
      return { taskId: task.taskId, type: task.type, status: "completed", durationMs: Date.now() - startedAt, document: await indexFile(task) };
    }
    if (task.type === "embedding") {
      return { taskId: task.taskId, type: task.type, status: "completed", durationMs: Date.now() - startedAt, embeddings: await embed(task) };
    }
    if (task.type === "symbols") {
      return { taskId: task.taskId, type: task.type, status: "completed", durationMs: Date.now() - startedAt, symbols: await symbols(task) };
    }
    if (task.type === "dependencies") {
      return { taskId: task.taskId, type: task.type, status: "completed", durationMs: Date.now() - startedAt, dependencies: await dependencies(task) };
    }
    return { taskId: task.taskId, type: task.type, status: "completed", durationMs: Date.now() - startedAt, semantic: await semantic(task) };
  } catch (error) {
    return {
      taskId: task.taskId,
      type: task.type,
      status: "failed",
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

parentPort?.on("message", async (request: ParallelWorkerRequest) => {
  const result = await runTask(request.task);
  const response: ParallelWorkerResponse = { requestId: request.requestId, result };
  parentPort?.postMessage(response);
});
