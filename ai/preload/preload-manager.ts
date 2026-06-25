import path from "node:path";
import { randomUUID } from "node:crypto";
import { Worker } from "node:worker_threads";

import type { PipelineEvent } from "../../components/ui/logicflow/types";
import { pipelineEventBus } from "../../components/ui/logicflow/logicflow-pipeline-emitter";
import { ModelRouter } from "../model-router";
import { getModelProfile } from "../model-profiles";
import { isOllamaReachable } from "../models/auto-router";
import type { ModelCapability, RoutingIntent } from "../types";
import { PreloadCache } from "./preload-cache";
import { preloadEventBus, type PreloadSignals, type PreloadStage, type PreloadTask } from "./preload-events";
import { preloadPredictor } from "./preload-predictor";
import { createDefaultStrategies, mergeTargets } from "./preload-strategy";
import type { WorkerRequest, WorkerResponse } from "./preload-worker";

export interface PreloadStatus {
  enabled: boolean;
  workerReady: boolean;
  workspaceRoot: string | null;
  inFlight: number;
  cache: ReturnType<PreloadCache["getSnapshot"]>;
  ollamaReachable: boolean | null;
}

export interface PreloadManagerOptions {
  maxConcurrentForeground?: number;
  maxConcurrentBackground?: number;
  workerPath?: string;
  enableWorker?: boolean;
}

const OLLAMA_BASE =
  process.env.OLLAMA_BASE_URL?.replace(/\/api\/chat\/?$/, "") ?? "http://localhost:11434";

const DEFAULT_OPTIONS: Required<PreloadManagerOptions> = {
  maxConcurrentForeground: 2,
  maxConcurrentBackground: 2,
  workerPath: path.join(__dirname, "preload-worker.js"),
  enableWorker: true,
};

export class PreloadManager {
  private readonly cache = new PreloadCache();
  private readonly strategies = createDefaultStrategies();
  private readonly router = new ModelRouter();
  private readonly options: Required<PreloadManagerOptions>;
  private readonly inFlight = new Map<string, AbortController>();
  private worker: Worker | null = null;
  private workerReady = false;
  private enabled = true;
  private workspaceRoot: string | null = null;
  private ollamaReachable: boolean | null = null;
  private pendingWorkerRequests = new Map<
    string,
    { resolve: (value: WorkerResponse) => void; reject: (reason: Error) => void }
  >();
  private pipelineUnsub: (() => void) | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private backgroundQueue: PreloadTask[] = [];
  private foregroundActive = 0;
  private backgroundActive = 0;

  constructor(options: PreloadManagerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.initWorker();
    this.pipelineUnsub = pipelineEventBus.on((event) => this.onPipelineEvent(event));
  }

  /** Wire Context Engine workspace root */
  configure(deps: { workspaceRoot?: string | null } = {}): void {
    if (deps.workspaceRoot !== undefined) {
      this.workspaceRoot = deps.workspaceRoot;
      this.cache.configure(deps.workspaceRoot);
    }
  }

  async onWorkspaceOpen(workspaceRoot: string, openFiles: string[] = []): Promise<void> {
    this.workspaceRoot = workspaceRoot;
    this.cache.configure(workspaceRoot);
    await this.cache.restore();

    const signals: PreloadSignals = {
      workspaceRoot,
      openFiles,
      userAction: "workspace.open",
      timestamp: Date.now(),
    };

    void this.schedulePreload(signals);
    void this.warmContextIndex(workspaceRoot);
    void this.probeOllama();
  }

  onFilesChanged(openFiles: string[], activeFile?: string): void {
    this.debounce(() => {
      void this.schedulePreload({
        workspaceRoot: this.workspaceRoot ?? undefined,
        openFiles,
        activeFile,
        userAction: "files.changed",
        timestamp: Date.now(),
      });
    });
  }

  onUserAction(action: string, meta: Partial<PreloadSignals> = {}): void {
    void this.schedulePreload({
      workspaceRoot: this.workspaceRoot ?? undefined,
      userAction: action,
      timestamp: Date.now(),
      ...meta,
    });
  }

  onModelSelected(modelId: string, intent?: RoutingIntent, capability?: ModelCapability): void {
    const hit = this.cache.isReady(modelId, "chat");
    this.cache.touch(modelId, "chat", hit);
    preloadEventBus.emit({
      type: hit ? "preload.cache.hit" : "preload.cache.miss",
      modelId,
      stage: "chat",
      meta: { intent, capability },
    });

    void this.schedulePreload({
      workspaceRoot: this.workspaceRoot ?? undefined,
      selectedModel: modelId,
      intent,
      capability,
      userAction: "model.selected",
      timestamp: Date.now(),
    });
  }

  onPipelineEvent(event: PipelineEvent): void {
    if (event.type === "pipeline.start") {
      void this.schedulePreload({
        workspaceRoot: this.workspaceRoot ?? undefined,
        pipelineNode: "suggestions",
        userAction: "pipeline.start",
        timestamp: Date.now(),
        ...(event.meta as Partial<PreloadSignals>),
      });
      return;
    }

    if (event.type === "node.enter") {
      void this.schedulePreload({
        workspaceRoot: this.workspaceRoot ?? undefined,
        pipelineNode: event.nodeId,
        userAction: `pipeline.${event.nodeId}`,
        timestamp: Date.now(),
      });
      return;
    }

    if (event.type === "pipeline.finish") {
      void this.evictUnused();
      void this.cache.persist();
    }
  }

  async warmModel(modelId: string, stage: PreloadStage = "chat"): Promise<boolean> {
    const profile = getModelProfile(modelId);
    if (!profile) return false;

    if (this.cache.isReady(modelId, stage)) {
      preloadEventBus.emit({ type: "preload.cache.hit", modelId, stage });
      return true;
    }

    const task: PreloadTask = {
      taskId: randomUUID(),
      modelId,
      provider: profile.provider,
      stage,
      capability: "chat",
      priority: 90,
      strategy: "warm-cache",
      reason: "Manual warm",
      createdAt: Date.now(),
    };

    return this.executeTask(task);
  }

  recordUsage(modelId: string, stage: PreloadStage, hit: boolean): void {
    this.cache.touch(modelId, stage, hit);
    preloadEventBus.emit({
      type: hit ? "preload.cache.hit" : "preload.cache.miss",
      modelId,
      stage,
    });
  }

  getStatus(): PreloadStatus {
    return {
      enabled: this.enabled,
      workerReady: this.workerReady,
      workspaceRoot: this.workspaceRoot,
      inFlight: this.inFlight.size,
      cache: this.cache.getSnapshot(),
      ollamaReachable: this.ollamaReachable,
    };
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.cancelAll();
  }

  async shutdown(): Promise<void> {
    this.cancelAll();
    this.pipelineUnsub?.();
    this.pipelineUnsub = null;

    if (this.worker) {
      this.postToWorker({ type: "shutdown" });
      await this.worker.terminate().catch(() => undefined);
      this.worker = null;
    }
  }

  /** Rank models via Model Router for a given capability/intent */
  rankForIntent(capability: ModelCapability, intent: RoutingIntent) {
    return this.router.rank({ prompt: "", capability, intent });
  }

  private async schedulePreload(signals: PreloadSignals): Promise<void> {
    if (!this.enabled) return;

    const rawTasks = mergeTargets(this.strategies, signals, this.cache, preloadPredictor);
    if (rawTasks.length === 0) return;

    preloadEventBus.emit({
      type: "preload.prediction",
      meta: { count: rawTasks.length, action: signals.userAction },
    });

    let tasks = rawTasks;
    if (this.workerReady) {
      try {
        const scored = await this.postToWorker({
          type: "score-tasks",
          requestId: randomUUID(),
          tasks: rawTasks,
          signals,
          history: this.cache.getHistory(),
          adaptiveWeights: this.cache.getSnapshot().adaptiveWeights,
        });
        if (scored.type === "tasks-scored") {
          tasks = scored.tasks.map((t) => ({ ...t, taskId: randomUUID(), createdAt: Date.now() }));
        }
      } catch {
        // fallback to main-thread ordering
      }
    }

    if (this.workerReady) {
      try {
        const scheduled = await this.postToWorker({
          type: "predict-priority",
          requestId: randomUUID(),
          tasks,
          maxConcurrent: this.options.maxConcurrentForeground,
        });
        if (scheduled.type === "schedule-ready") {
          for (const task of scheduled.foreground) {
            void this.enqueueTask({ ...task, taskId: randomUUID(), createdAt: Date.now(), background: false });
          }
          for (const task of scheduled.background) {
            this.backgroundQueue.push({ ...task, taskId: randomUUID(), createdAt: Date.now(), background: true });
          }
          void this.drainBackgroundQueue();
          return;
        }
      } catch {
        // fallback
      }
    }

    for (const task of tasks) {
      if (task.background) {
        this.backgroundQueue.push(task);
      } else {
        void this.enqueueTask(task);
      }
    }
    void this.drainBackgroundQueue();
  }

  private async enqueueTask(task: PreloadTask): Promise<void> {
    if (this.cache.isReady(task.modelId, task.stage)) return;
    if (this.inFlight.has(`${task.modelId}::${task.stage}`)) return;

    if (!task.background) {
      if (this.foregroundActive >= this.options.maxConcurrentForeground) {
        this.backgroundQueue.push({ ...task, background: true });
        return;
      }
      this.foregroundActive += 1;
    } else {
      if (this.backgroundActive >= this.options.maxConcurrentBackground) {
        this.backgroundQueue.push(task);
        return;
      }
      this.backgroundActive += 1;
    }

    preloadEventBus.emit({
      type: "preload.requested",
      taskId: task.taskId,
      modelId: task.modelId,
      stage: task.stage,
      strategy: task.strategy,
    });

    try {
      await this.executeTask(task);
    } finally {
      if (task.background) this.backgroundActive = Math.max(0, this.backgroundActive - 1);
      else this.foregroundActive = Math.max(0, this.foregroundActive - 1);
      void this.drainBackgroundQueue();
    }
  }

  private async drainBackgroundQueue(): Promise<void> {
    while (
      this.backgroundQueue.length > 0 &&
      this.backgroundActive < this.options.maxConcurrentBackground
    ) {
      const next = this.backgroundQueue.shift();
      if (!next) break;
      void this.enqueueTask(next);
    }
  }

  private async executeTask(task: PreloadTask): Promise<boolean> {
    const key = `${task.modelId}::${task.stage}`;
    if (this.inFlight.has(key)) return false;

    const profile = getModelProfile(task.modelId);
    if (!profile) return false;

    const controller = new AbortController();
    this.inFlight.set(key, controller);

    this.cache.setWarming(task.modelId, profile.provider, task.stage, task.strategy, task.priority);

    preloadEventBus.emit({
      type: "preload.started",
      taskId: task.taskId,
      modelId: task.modelId,
      stage: task.stage,
      strategy: task.strategy,
    });

    const startedAt = Date.now();
    let ok = false;

    try {
      if (profile.provider === "open_source") {
        ok = await this.warmOllamaModel(task.modelId, controller.signal);
      } else {
        ok = await this.warmCloudModel(task, controller.signal);
      }

      if (ok) {
        this.cache.markReady(task.modelId, task.stage, Date.now() - startedAt);
        preloadEventBus.emit({
          type: "preload.completed",
          taskId: task.taskId,
          modelId: task.modelId,
          stage: task.stage,
          meta: { latencyMs: Date.now() - startedAt },
        });
      } else {
        this.cache.markFailed(task.modelId, task.stage, "Warm returned false");
        preloadEventBus.emit({
          type: "preload.failed",
          taskId: task.taskId,
          modelId: task.modelId,
          stage: task.stage,
          message: "Warm returned false",
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.cache.markFailed(task.modelId, task.stage, message);
      preloadEventBus.emit({
        type: "preload.failed",
        taskId: task.taskId,
        modelId: task.modelId,
        stage: task.stage,
        message,
      });
    } finally {
      this.inFlight.delete(key);
    }

    return ok;
  }

  private async warmOllamaModel(modelId: string, signal: AbortSignal): Promise<boolean> {
    const reachable = this.ollamaReachable ?? (await this.probeOllama());
    if (!reachable) return false;

    const response = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal,
      body: JSON.stringify({
        model: modelId,
        prompt: " ",
        stream: false,
        keep_alive: "10m",
        options: { num_predict: 1 },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Ollama warm failed HTTP ${response.status}: ${body}`);
    }

    return true;
  }

  private async warmCloudModel(task: PreloadTask, signal: AbortSignal): Promise<boolean> {
    const ranked = this.router.rank({
      prompt: "",
      capability: task.capability,
      intent: task.intent,
      metadata: { preferredModel: task.modelId },
    });

    const match = ranked.find((r) => r.model.id === task.modelId);
    if (!match) return false;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    signal.addEventListener("abort", () => controller.abort());

    try {
      await fetch(match.model.endpoint, {
        method: "HEAD",
        signal: controller.signal,
      }).catch(() => undefined);
    } finally {
      clearTimeout(timeout);
    }

    return true;
  }

  private async warmContextIndex(workspaceRoot: string): Promise<void> {
    try {
      const { ContextEngineApi } = await import("../../context-engine/api");
      const engine = new ContextEngineApi();
      void engine.indexWorkspace(workspaceRoot).catch(() => undefined);
    } catch {
      // context preload is best-effort
    }
  }

  private async evictUnused(): Promise<void> {
    const keep = this.cache
      .list()
      .filter((e) => Date.now() - e.lastUsed < 120_000)
      .map((e) => e.modelId);

    for (const entry of this.cache.listEvictable(keep)) {
      if (entry.provider === "open_source") {
        void this.unloadOllamaModel(entry.modelId);
      }
      this.cache.evict(entry.modelId, entry.stage);
      preloadEventBus.emit({
        type: "preload.evicted",
        modelId: entry.modelId,
        stage: entry.stage,
      });
    }
  }

  private async unloadOllamaModel(modelId: string): Promise<void> {
    try {
      await fetch(`${OLLAMA_BASE}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: modelId,
          keep_alive: 0,
        }),
      });
    } catch {
      // best-effort unload
    }
  }

  private async probeOllama(): Promise<boolean> {
    this.ollamaReachable = await isOllamaReachable();
    return this.ollamaReachable;
  }

  private debounce(fn: () => void, ms = 400): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(fn, ms);
  }

  private cancelAll(): void {
    for (const controller of this.inFlight.values()) {
      controller.abort();
    }
    this.inFlight.clear();
    this.backgroundQueue = [];
  }

  private initWorker(): void {
    if (!this.options.enableWorker) return;

    try {
      this.worker = new Worker(this.options.workerPath, {
        workerData: { workerId: "caval-preload" },
      });

      this.worker.on("message", (message: WorkerResponse | { type: "worker.ready" }) => {
        if (message.type === "worker.ready") {
          this.workerReady = true;
          preloadEventBus.emit({ type: "preload.worker.ready" });
          return;
        }

        const pending = this.pendingWorkerRequests.get(message.requestId);
        if (!pending) return;
        this.pendingWorkerRequests.delete(message.requestId);
        if (message.type === "error") {
          pending.reject(new Error(message.message));
        } else {
          pending.resolve(message);
        }
      });

      this.worker.on("error", (error: Error) => {
        this.workerReady = false;
        preloadEventBus.emit({
          type: "preload.worker.error",
          message: error.message,
        });
      });
    } catch (error) {
      this.workerReady = false;
      preloadEventBus.emit({
        type: "preload.worker.error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private postToWorker(request: WorkerRequest): Promise<WorkerResponse> {
    return new Promise((resolve, reject) => {
      if (!this.worker || !this.workerReady) {
        reject(new Error("Preload worker not ready"));
        return;
      }

      const requestId = "requestId" in request ? request.requestId : randomUUID();
      const withId = { ...request, requestId } as WorkerRequest;

      const timeout = setTimeout(() => {
        this.pendingWorkerRequests.delete(requestId);
        reject(new Error("Preload worker timeout"));
      }, 10_000);

      this.pendingWorkerRequests.set(requestId, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (reason) => {
          clearTimeout(timeout);
          reject(reason);
        },
      });

      this.worker.postMessage(withId);
    });
  }
}

export const preloadManager = new PreloadManager({
  workerPath: path.join(__dirname, "preload-worker.js"),
});
