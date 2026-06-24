import type { Listener, PipelineEvent } from "./types";

class EventBus {
  private readonly listeners = new Set<Listener>();

  emit(event: PipelineEvent): void {
    const frozen = Object.freeze({ ...event }) as PipelineEvent;
    for (const listener of Array.from(this.listeners)) {
      try {
        listener(frozen);
      } catch {
        // swallow listener errors
      }
    }
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.off(listener);
  }

  off(listener: Listener): void {
    this.listeners.delete(listener);
  }
}

export const eventBus = new EventBus();
