import type { Listener, PipelineEvent } from "../../components/ui/logicflow/types";

class PipelineEventBus {
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
    return () => this.listeners.delete(listener);
  }

  off(listener: Listener): void {
    this.listeners.delete(listener);
  }
}

export const pipelineEventBus = new PipelineEventBus();
