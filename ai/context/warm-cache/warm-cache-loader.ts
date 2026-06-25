import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { ContextEngineApi } from "../../../context-engine/api";
import { preloadModel } from "../../models/model-preload";
import { parallelContextLoader, type ParallelContextLoader } from "../parallel/parallel-loader";
import type { ParallelPriority } from "../parallel/parallel-types";
import { warmCacheStore, type WarmCacheStore } from "./warm-cache-store";
import type { WarmCacheRequest, WarmCacheSnapshot } from "./warm-cache-types";
import { WARM_CACHE_LOG_PREFIX } from "./warm-cache-types";

export class WarmCacheLoader {
  constructor(
    private readonly store: WarmCacheStore = warmCacheStore,
    private readonly parallelLoader: ParallelContextLoader = parallelContextLoader,
    private readonly contextEngine = new ContextEngineApi()
  ) {}

  async warm(request: WarmCacheRequest): Promise<WarmCacheSnapshot> {
    const files = await this.resolveFiles(request);
    const changed = [];

    for (const file of files) {
      const content = file.content ?? (await fs.readFile(file.path, "utf8").catch(() => ""));
      const relative = path.relative(request.workspaceRoot, file.path);
      const contentHash = crypto.createHash("sha256").update(content).digest("hex");
      if (!this.store.hasFresh(relative, contentHash)) {
        changed.push({ path: file.path, content });
      }
    }

    if (changed.length === 0) {
      console.log(`${WARM_CACHE_LOG_PREFIX} cache hit (${request.reason})`);
      return this.store.snapshot();
    }

    console.log(`${WARM_CACHE_LOG_PREFIX} warming ${changed.length} files (${request.reason})`);
    const result = await this.parallelLoader.load({
      workspaceRoot: request.workspaceRoot,
      files: changed,
      includeEmbeddings: true,
      includeSymbols: true,
      includeDependencies: true,
      includeSemantic: true,
      priority: this.priorityForReason(request.reason),
      tokenId: request.tokenId,
    });

    this.store.upsertFromParallel(result);
    preloadModel("qwen2.5-coder:7b", { background: true, priority: 50 });
    return this.store.snapshot();
  }

  async warmWorkspace(workspaceRoot: string, limit = 80): Promise<WarmCacheSnapshot> {
    void this.contextEngine.restoreWorkspace(workspaceRoot).catch(() => undefined);
    const files = await this.walk(workspaceRoot, limit);
    return this.warm({ workspaceRoot, files: files.map((file) => ({ path: file })), reason: "startup" });
  }

  invalidate(filePath: string): void {
    this.store.invalidate(filePath);
    console.log(`${WARM_CACHE_LOG_PREFIX} invalidated ${filePath}`);
  }

  private async resolveFiles(request: WarmCacheRequest): Promise<Array<{ path: string; content?: string }>> {
    if (request.files?.length) return request.files;
    if (request.activeFile) return [{ path: request.activeFile }];
    return (await this.walk(request.workspaceRoot, 40)).map((file) => ({ path: file }));
  }

  private priorityForReason(reason: WarmCacheRequest["reason"]): ParallelPriority {
    if (reason === "file-open" || reason === "pipeline") return "HIGH";
    if (reason === "project-change" || reason === "predictive") return "MEDIUM";
    return "LOW";
  }

  private async walk(dir: string, limit: number, collected: string[] = []): Promise<string[]> {
    if (collected.length >= limit) return collected;
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (collected.length >= limit) break;
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git" || entry.name === ".caval") continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) await this.walk(fullPath, limit, collected);
      else if (/\.(ts|tsx|js|jsx|json|md|css|html)$/i.test(entry.name)) collected.push(fullPath);
    }
    return collected;
  }
}

export const warmCacheLoader = new WarmCacheLoader();
