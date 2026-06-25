import type { AIModelId, LoadedModelHandle } from "./model-types";

/** In-memory cache of loaded / preloaded models. */
export class ModelCache {
  private readonly entries = new Map<AIModelId, LoadedModelHandle>();

  get(modelId: AIModelId): LoadedModelHandle | undefined {
    return this.entries.get(modelId);
  }

  isReady(modelId: AIModelId): boolean {
    const entry = this.entries.get(modelId);
    return entry?.state === "ready" && entry.ready === true;
  }

  isLoading(modelId: AIModelId): boolean {
    return this.entries.get(modelId)?.state === "loading";
  }

  set(handle: LoadedModelHandle): void {
    this.entries.set(handle.modelId, handle);
  }

  delete(modelId: AIModelId): boolean {
    return this.entries.delete(modelId);
  }

  list(): LoadedModelHandle[] {
    return Array.from(this.entries.values());
  }

  readyIds(): AIModelId[] {
    return this.list().filter((h) => h.ready).map((h) => h.modelId);
  }
}

export const modelCache = new ModelCache();
