import fs from "node:fs/promises";
import path from "node:path";

import { createTasksForFile } from "./parallel-batching";
import { priorityForFile } from "./parallel-priority";
import { parallelScheduler, type ParallelScheduler } from "./parallel-scheduler";
import type { ParallelLoadRequest, ParallelLoadResult, ParallelPriority, ParallelTaskResult } from "./parallel-types";
import { PARALLEL_LOG_PREFIX } from "./parallel-types";

const DEFAULT_INCLUDE = new Set([".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".css", ".html"]);

export class ParallelContextLoader {
  constructor(private readonly scheduler: ParallelScheduler = parallelScheduler) {}

  async load(request: ParallelLoadRequest): Promise<ParallelLoadResult> {
    const startedAt = Date.now();
    const files = await Promise.all(
      request.files.map(async (file) => ({
        path: file.path,
        content: file.content ?? (await fs.readFile(file.path, "utf8").catch(() => "")),
      }))
    );

    const tasks = files.flatMap((file) =>
      createTasksForFile({
        workspaceRoot: request.workspaceRoot,
        filePath: file.path,
        content: file.content,
        priority: request.priority ?? "MEDIUM",
        tokenId: request.tokenId,
        includeEmbeddings: request.includeEmbeddings ?? true,
        includeSymbols: request.includeSymbols ?? true,
        includeDependencies: request.includeDependencies ?? true,
        includeSemantic: request.includeSemantic ?? true,
      })
    );

    console.log(`${PARALLEL_LOG_PREFIX} loading ${files.length} files / ${tasks.length} tasks`);
    const results = await Promise.all(tasks.map((task) => this.scheduler.schedule(task)));
    return this.merge(results, Date.now() - startedAt);
  }

  async loadWorkspace(input: {
    workspaceRoot: string;
    limit?: number;
    activeFile?: string;
    priority?: ParallelPriority;
    tokenId?: string;
  }): Promise<ParallelLoadResult> {
    const files = await this.walk(input.workspaceRoot, input.limit ?? 120);
    return this.load({
      workspaceRoot: input.workspaceRoot,
      files: files.map((file) => ({ path: file })),
      includeEmbeddings: true,
      includeSymbols: true,
      includeDependencies: true,
      includeSemantic: true,
      priority: input.priority ?? (input.activeFile ? priorityForFile(input.activeFile, input.activeFile) : "LOW"),
      tokenId: input.tokenId,
    });
  }

  cancel(tokenId: string): void {
    this.scheduler.cancel(tokenId);
  }

  private merge(results: ParallelTaskResult[], durationMs: number): ParallelLoadResult {
    return {
      documents: results.flatMap((r) => (r.document ? [r.document] : [])),
      embeddings: results.flatMap((r) => r.embeddings ?? []),
      symbols: results.flatMap((r) => r.symbols ?? []),
      dependencies: results.flatMap((r) => r.dependencies ?? []),
      semantics: results.flatMap((r) => (r.semantic ? [r.semantic] : [])),
      durationMs,
    };
  }

  private async walk(dir: string, limit: number, collected: string[] = []): Promise<string[]> {
    if (collected.length >= limit) return collected;
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (collected.length >= limit) break;
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git" || entry.name === ".caval") {
        continue;
      }
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.walk(fullPath, limit, collected);
      } else if (DEFAULT_INCLUDE.has(path.extname(entry.name))) {
        collected.push(fullPath);
      }
    }
    return collected;
  }
}

export const parallelContextLoader = new ParallelContextLoader();
