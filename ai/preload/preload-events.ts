import type { LogicFlowNodeId } from "../../components/ui/logicflow/types";
import type { ModelCapability, RoutingIntent } from "../types";

export type PreloadStage = "suggestions" | "composer" | "review" | "chat" | "autocomplete" | "context";

export type PreloadStrategyName =
  | "predictive"
  | "contextual"
  | "orchestrated"
  | "parallel"
  | "lazy"
  | "warm-cache"
  | "adaptive";

export type PreloadEventType =
  | "preload.requested"
  | "preload.started"
  | "preload.completed"
  | "preload.failed"
  | "preload.evicted"
  | "preload.cache.hit"
  | "preload.cache.miss"
  | "preload.prediction"
  | "preload.adaptive"
  | "preload.worker.ready"
  | "preload.worker.error";

export interface PreloadTarget {
  modelId: string;
  provider: string;
  stage: PreloadStage;
  capability: ModelCapability;
  intent?: RoutingIntent;
  priority: number;
  strategy: PreloadStrategyName;
  reason: string;
  background?: boolean;
}

export interface PreloadTask extends PreloadTarget {
  taskId: string;
  createdAt: number;
  deadlineMs?: number;
}

export interface PreloadSignals {
  workspaceRoot?: string;
  openFiles?: string[];
  activeFile?: string;
  pipelineNode?: LogicFlowNodeId;
  userAction?: string;
  selectedModel?: string;
  intent?: RoutingIntent;
  capability?: ModelCapability;
  timestamp: number;
}

export interface PreloadEvent {
  type: PreloadEventType;
  timestamp: number;
  taskId?: string;
  modelId?: string;
  stage?: PreloadStage;
  strategy?: PreloadStrategyName;
  message?: string;
  meta?: Record<string, unknown>;
}

export type PreloadListener = (event: PreloadEvent) => void;

export class PreloadEventBus {
  private readonly listeners = new Set<PreloadListener>();

  emit(event: Omit<PreloadEvent, "timestamp"> & { timestamp?: number }): void {
    const frozen: PreloadEvent = Object.freeze({
      ...event,
      timestamp: event.timestamp ?? Date.now(),
    });
    for (const listener of Array.from(this.listeners)) {
      try {
        listener(frozen);
      } catch {
        // listener errors must not break preload pipeline
      }
    }
  }

  on(listener: PreloadListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  off(listener: PreloadListener): void {
    this.listeners.delete(listener);
  }
}

export const preloadEventBus = new PreloadEventBus();
