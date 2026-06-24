import { eventBus } from "./EventBus";
import type { PipelineEvent } from "./types";

export async function replayEvents(
  events: PipelineEvent[],
  speed = 1.0,
  onEmit?: (event: PipelineEvent) => void
): Promise<void> {
  for (const event of events) {
    const replayEvent = { ...event, timestamp: Date.now() } as PipelineEvent;
    eventBus.emit(replayEvent);
    onEmit?.(replayEvent);
    await new Promise((resolve) => setTimeout(resolve, Math.max(80, 600 / speed)));
  }
}
