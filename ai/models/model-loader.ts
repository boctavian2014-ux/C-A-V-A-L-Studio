import type { AIModelConfig, AIModelId, LoadedModelHandle } from "./model-types";
import { LOG_PREFIX } from "./model-types";
import { getModelConfig } from "./model-registry";
import { modelCache } from "./model-cache";
import { canPreloadHttpModel, providerApiKeyEnv } from "./provider-credentials";

const OLLAMA_BASE =
  (typeof process !== "undefined" && process.env.OLLAMA_BASE_URL
    ? process.env.OLLAMA_BASE_URL.replace(/\/api\/chat\/?$/, "")
    : undefined) ?? "http://localhost:11434";

/** Load a model into cache — HTTP probe or Ollama warm. */
export async function loadModel(config: AIModelConfig): Promise<LoadedModelHandle> {
  const startedAt = Date.now();
  console.log(`${LOG_PREFIX} Starting preload for ${config.id}`);

  const loading: LoadedModelHandle = {
    modelId: config.id,
    config,
    state: "loading",
    loadedAt: startedAt,
    ready: false,
  };
  modelCache.set(loading);

  try {
    if (config.runtime === "local_ollama") {
      await warmOllamaModel(config.id);
    } else if (config.runtime === "http") {
      if (!canPreloadHttpModel(config)) {
        const envKey = providerApiKeyEnv(config.provider);
        console.log(
          `${LOG_PREFIX} Skip preload for ${config.id} (${envKey ?? "API key"} not configured)`
        );
        modelCache.delete(config.id);
        return {
          modelId: config.id,
          config,
          state: "unloaded",
          loadedAt: startedAt,
          ready: false,
        };
      }
      const warmed = await warmHttpModel(config);
      if (!warmed) {
        modelCache.delete(config.id);
        return {
          modelId: config.id,
          config,
          state: "unloaded",
          loadedAt: startedAt,
          ready: false,
        };
      }
    } else {
      // local_gguf — interface only; mark ready without I/O
      console.log(`${LOG_PREFIX} Local GGUF runtime stub for ${config.id} (not implemented)`);
    }

    const handle: LoadedModelHandle = {
      modelId: config.id,
      config,
      state: "ready",
      loadedAt: startedAt,
      ready: true,
      latencyMs: Date.now() - startedAt,
    };
    modelCache.set(handle);
    console.log(`${LOG_PREFIX} Model ${config.id} ready (${handle.latencyMs}ms)`);
    return handle;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failed: LoadedModelHandle = {
      modelId: config.id,
      config,
      state: "failed",
      loadedAt: startedAt,
      ready: false,
      error: message,
    };
    modelCache.set(failed);
    console.warn(`${LOG_PREFIX} Model ${config.id} failed: ${message}`);
    throw error;
  }
}

/** Unload model from cache; for Ollama sends keep_alive: 0. */
export async function unloadModel(modelId: AIModelId): Promise<void> {
  const config = getModelConfig(modelId);
  if (!config) {
    modelCache.delete(modelId);
    return;
  }

  if (config.runtime === "local_ollama") {
    try {
      await fetch(`${OLLAMA_BASE}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: modelId, keep_alive: 0 }),
      });
    } catch {
      // best-effort
    }
  }

  modelCache.set({
    modelId,
    config,
    state: "unloaded",
    loadedAt: Date.now(),
    ready: false,
  });
  modelCache.delete(modelId);
  console.log(`${LOG_PREFIX} Model ${modelId} unloaded`);
}

export function isModelLoaded(modelId: AIModelId): boolean {
  return modelCache.isReady(modelId);
}

async function warmOllamaModel(modelId: string): Promise<void> {
  const response = await fetch(`${OLLAMA_BASE}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(120_000),
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
}

async function warmHttpModel(config: AIModelConfig): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch(config.endpoint, {
      method: "HEAD",
      signal: controller.signal,
    }).catch(() =>
      fetch(config.endpoint.replace(/\/chat\/completions$/, ""), {
        method: "GET",
        signal: controller.signal,
      })
    );

    if (!response) {
      console.log(
        `${LOG_PREFIX} ${config.id} endpoint unreachable — warm skipped (will retry on use)`
      );
      return false;
    }
    return true;
  } catch {
    console.log(
      `${LOG_PREFIX} ${config.id} warm skipped: network unreachable (will retry on use)`
    );
    return false;
  } finally {
    clearTimeout(timeout);
  }
}