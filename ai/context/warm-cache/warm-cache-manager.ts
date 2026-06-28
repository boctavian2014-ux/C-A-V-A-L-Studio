import { randomUUID } from "node:crypto";

import type { PipelineEvent } from "../../../components/ui/logicflow/types";
import { pipelineEventBus } from "../../../components/ui/logicflow/logicflow-pipeline-emitter";
import { ModelRouter } from "../../model-router";
import { warmCacheLoader, type WarmCacheLoader } from "./warm-cache-loader";
import { warmCachePredictor, type WarmCachePredictor } from "./warm-cache-predictor";
import { warmCacheStore, type WarmCacheStore } from "./warm-cache-store";
import type { WarmCacheRequest, WarmCacheSnapshot } from "./warm-cache-types";
import { WARM_CACHE_LOG_PREFIX } from "./warm-cache-types";

export class WarmCacheManager {
  private workspaceRoot: string | null = null;
  private activeTokenId: string | null = null;

  constructor(
    private readonly loader: WarmCacheLoader = warmCacheLoader,
    private readonly predictor: WarmCachePredictor = warmCachePredictor,
    private readonly store: WarmCacheStore = warmCacheStore,
    private readonly router = new ModelRouter()
  ) {
    pipelineEventBus.on((event) => this.onPipelineEvent(event));
  }

  warmAtStartup(workspaceRoot: string): void {
    this.workspaceRoot = workspaceRoot;
    console.log(`${WARM_CACHE_LOG_PREFIX} startup warm ${workspaceRoot} (deferred)`);
    void this.loader
      .warm({
        workspaceRoot,
        reason: "startup",
        files: [],
      })
      .catch((error) => this.logError(error));
  }

  configureWorkspace(workspaceRoot: string): void {
    this.workspaceRoot = workspaceRoot;
  }

  onProjectChange(workspaceRoot: string): void {
    this.workspaceRoot = workspaceRoot;
    this.activeTokenId = randomUUID();
    console.log(`${WARM_CACHE_LOG_PREFIX} project change ${workspaceRoot}`);
    void this.loader.warm({ workspaceRoot, reason: "project-change", tokenId: this.activeTokenId }).catch((error) => this.logError(error));
  }

  onFileOpen(filePath: string, content?: string): void {
    if (!this.workspaceRoot) return;
    this.activeTokenId = randomUUID();
    void this.loader
      .warm({
        workspaceRoot: this.workspaceRoot,
        files: [{ path: filePath, content }],
        activeFile: filePath,
        reason: "file-open",
        tokenId: this.activeTokenId,
      })
      .catch((error) => this.logError(error));
  }

  onFileChange(filePath: string, content: string): void {
    if (!this.workspaceRoot) return;
    this.loader.invalidate(filePath);
    void this.loader
      .warm({
        workspaceRoot: this.workspaceRoot,
        files: [{ path: filePath, content }],
        activeFile: filePath,
        reason: "file-change",
      })
      .catch((error) => this.logError(error));
  }

  predictAndWarm(input: {
    activeFile?: string;
    openFiles?: string[];
    userAction?: string;
    objectiveDraft?: string;
  }): void {
    if (!this.workspaceRoot) return;
    const prediction = this.predictor.predict({
      workspaceRoot: this.workspaceRoot,
      activeFile: input.activeFile,
      openFiles: input.openFiles,
      userAction: input.userAction,
      objectiveDraft: input.objectiveDraft,
    });
    if (prediction.files.length === 0) return;
    void this.loader
      .warm({
        workspaceRoot: this.workspaceRoot,
        files: prediction.files.map((file) => ({ path: file })),
        activeFile: input.activeFile,
        reason: prediction.reason,
      })
      .catch((error) => this.logError(error));
  }

  async ensureWarm(request: WarmCacheRequest): Promise<WarmCacheSnapshot> {
    this.workspaceRoot = request.workspaceRoot;
    return this.loader.warm(request);
  }

  snapshot(): WarmCacheSnapshot {
    return this.store.snapshot();
  }

  private onPipelineEvent(event: PipelineEvent): void {
    if (!this.workspaceRoot) return;
    if (event.type === "pipeline.start") {
      this.router.predictModelForTask({ capability: "planning", intent: "planning" });
      this.predictAndWarm({ userAction: "pipeline.start" });
    }
    if (event.type === "node.enter" && (event.nodeId === "composer" || event.nodeId === "review")) {
      this.predictAndWarm({ userAction: `pipeline.${event.nodeId}` });
    }
  }

  private logError(error: unknown): void {
    console.warn(`${WARM_CACHE_LOG_PREFIX} ${error instanceof Error ? error.message : String(error)}`);
  }
}

export const warmCacheManager = new WarmCacheManager();
