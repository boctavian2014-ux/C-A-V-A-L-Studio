import type { ModelCapability } from "../types";

/** Stable identifier for a model in the Caval AI layer. */
export type AIModelId = string;

/** High-level role of a model in the IDE. */
export type AIModelKind = "reasoning" | "coding" | "autocomplete" | "tools" | "ui" | "general" | "local";

/** Where the model runs — HTTP API or local runtime. */
export type AIModelRuntime = "http" | "local_ollama" | "local_gguf";

export type AIModelLoadState = "idle" | "loading" | "ready" | "failed" | "unloaded";

export interface AIModelConfig {
  id: AIModelId;
  displayName: string;
  kind: AIModelKind;
  runtime: AIModelRuntime;
  provider: string;
  endpoint: string;
  /** Approximate footprint in MB (for prioritisation / eviction). */
  sizeEstimateMb: number;
  capabilities: ModelCapability[];
  priority: number;
}

/** Handle returned after a model is loaded or preloaded. */
export interface LoadedModelHandle {
  modelId: AIModelId;
  config: AIModelConfig;
  state: AIModelLoadState;
  loadedAt: number;
  ready: boolean;
  latencyMs?: number;
  error?: string;
}

/** Context passed when opening a project — drives contextual preload. */
export interface PreloadContext {
  language: string;
  projectType: string;
}

/** Minimal task descriptor for router-driven preload. */
export interface AITaskDescriptor {
  capability: ModelCapability;
  intent?: string;
  preferredModel?: AIModelId;
}

export interface PreloadResult {
  modelId: AIModelId;
  ok: boolean;
  latencyMs?: number;
  error?: string;
}

export interface PreloadOptions {
  /** Run without blocking caller — default true. */
  background?: boolean;
  /** Skip if already ready in cache. */
  skipIfReady?: boolean;
  /** Priority boost (higher = sooner in queue). */
  priority?: number;
}

export const LOG_PREFIX = "[PRELOAD]";
