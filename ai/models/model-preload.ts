import type { AIModelId, LoadedModelHandle, PreloadContext, PreloadOptions, PreloadResult } from "./model-types";
import { LOG_PREFIX } from "./model-types";
import { getCoreModelConfigs, getModelConfig, getModelsForContext, LOCAL_FALLBACK_ID } from "./model-registry";
import { modelCache } from "./model-cache";
import { isModelLoaded, loadModel } from "./model-loader";

interface QueuedPreload {
  modelId: AIModelId;
  priority: number;
}

/** Simple priority queue — extensible to parallel / adaptive preload later. */
class PreloadQueue {
  private readonly queue: QueuedPreload[] = [];
  private running = 0;
  private readonly maxConcurrent: number;

  constructor(maxConcurrent = 2) {
    this.maxConcurrent = maxConcurrent;
  }

  enqueue(modelId: AIModelId, priority = 50): void {
    if (modelCache.isReady(modelId) || modelCache.isLoading(modelId)) return;
    if (this.queue.some((q) => q.modelId === modelId)) return;
    this.queue.push({ modelId, priority });
    this.queue.sort((a, b) => b.priority - a.priority);
    void this.drain();
  }

  private async drain(): Promise<void> {
    while (this.running < this.maxConcurrent && this.queue.length > 0) {
      const next = this.queue.shift();
      if (!next) break;
      this.running += 1;
      void this.runOne(next.modelId).finally(() => {
        this.running = Math.max(0, this.running - 1);
        void this.drain();
      });
    }
  }

  private async runOne(modelId: AIModelId): Promise<PreloadResult> {
    try {
      const handle = await ensureModelLoaded(modelId);
      return { modelId, ok: handle.ready, latencyMs: handle.latencyMs };
    } catch (error) {
      return {
        modelId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

const preloadQueue = new PreloadQueue(2);

/** Preload core IDE models in background — does not block caller. */
export function preloadCoreModels(): void {
  console.log(`${LOG_PREFIX} preloadCoreModels()`);
  const configs = getCoreModelConfigs();
  for (const config of configs) {
    preloadModel(config.id, { priority: config.priority, background: true });
  }
  // Always warm local fallback for offline / free tier
  preloadModel(LOCAL_FALLBACK_ID, { priority: 40, background: true });
}

/** Contextual preload when a project is opened. */
export function preloadForContext(context: PreloadContext): void {
  console.log(`${LOG_PREFIX} preloadForContext(${context.language}, ${context.projectType})`);
  const configs = getModelsForContext(context);
  for (const config of configs) {
    preloadModel(config.id, { priority: config.priority + 10, background: true });
  }
}

/** Queue a single model for background preload. */
export function preloadModel(modelId: AIModelId, options: PreloadOptions = {}): void {
  const config = getModelConfig(modelId);
  if (!config) {
    console.warn(`${LOG_PREFIX} Unknown model id: ${modelId}`);
    return;
  }

  if (options.skipIfReady !== false && modelCache.isReady(modelId)) {
    console.log(`${LOG_PREFIX} Model ${modelId} already ready — skip`);
    return;
  }

  const priority = options.priority ?? config.priority;

  if (options.background === false) {
    void ensureModelLoaded(modelId);
    return;
  }

  preloadQueue.enqueue(modelId, priority);
}

/** Ensure model is loaded — uses cache or lazy-loads. */
export async function ensureModelLoaded(modelId: AIModelId): Promise<LoadedModelHandle> {
  const cached = modelCache.get(modelId);
  if (cached?.ready && cached.state === "ready") {
    return cached;
  }

  if (cached?.state === "loading") {
    return waitForReady(modelId);
  }

  const config = getModelConfig(modelId);
  if (!config) {
    throw new Error(`${LOG_PREFIX} Model not registered: ${modelId}`);
  }

  return loadModel(config);
}

async function waitForReady(modelId: AIModelId, timeoutMs = 120_000): Promise<LoadedModelHandle> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const entry = modelCache.get(modelId);
    if (entry?.ready) return entry;
    if (entry?.state === "failed") {
      throw new Error(entry.error ?? `Model ${modelId} failed to load`);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`${LOG_PREFIX} Timeout waiting for ${modelId}`);
}

/** Snapshot for diagnostics / UI. */
export function getPreloadStatus(): {
  ready: AIModelId[];
  loading: AIModelId[];
  failed: AIModelId[];
} {
  const list = modelCache.list();
  return {
    ready: list.filter((h) => h.ready).map((h) => h.modelId),
    loading: list.filter((h) => h.state === "loading").map((h) => h.modelId),
    failed: list.filter((h) => h.state === "failed").map((h) => h.modelId),
  };
}

export { isModelLoaded, modelCache };
