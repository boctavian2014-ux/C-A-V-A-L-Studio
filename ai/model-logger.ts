import type { ModelProviderId } from "./model-profiles";

export type ModelRouterLogEvent =
  | "model_selected"
  | "model_score"
  | "model_fallback"
  | "model_retry"
  | "model_error";

export interface ModelRouterLogEntry {
  event: ModelRouterLogEvent;
  provider?: ModelProviderId;
  model?: string;
  score?: number;
  reason: string;
  requestId?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export class ModelLogger {
  private readonly entries: ModelRouterLogEntry[] = [];

  log(entry: Omit<ModelRouterLogEntry, "timestamp">): void {
    const fullEntry: ModelRouterLogEntry = {
      ...entry,
      timestamp: new Date().toISOString()
    };

    this.entries.push(fullEntry);
    if (process.env.CAVAL_AI_ROUTER_DEBUG === "1") {
      console.info(`[CavalModelRouter] ${fullEntry.event}`, fullEntry);
    }
  }

  score(entry: Omit<ModelRouterLogEntry, "event" | "timestamp">): void {
    this.log({ ...entry, event: "model_score" });
  }

  selected(entry: Omit<ModelRouterLogEntry, "event" | "timestamp">): void {
    this.log({ ...entry, event: "model_selected" });
  }

  fallback(entry: Omit<ModelRouterLogEntry, "event" | "timestamp">): void {
    this.log({ ...entry, event: "model_fallback" });
  }

  retry(entry: Omit<ModelRouterLogEntry, "event" | "timestamp">): void {
    this.log({ ...entry, event: "model_retry" });
  }

  error(entry: Omit<ModelRouterLogEntry, "event" | "timestamp">): void {
    this.log({ ...entry, event: "model_error" });
  }

  snapshot(): ModelRouterLogEntry[] {
    return [...this.entries];
  }
}
