import type { AiPersistence } from "../db/ai-persistence";
import {
  sanitizeTimelineEvent,
  type TimelineEvent,
  type TimelineEventInput,
} from "../../shared/ai-timeline-contract";

export type TimelineChunkSender = {
  send: (chunk: Record<string, unknown>) => boolean;
  isAlive?: () => boolean;
};

/** In-memory buffer until assistant message completes (Pas 7a.2). */
const timelineBuffers = new Map<string, TimelineEvent[]>();

/**
 * Build a sanitized timeline event and push it on the existing AI stream channel.
 * Also buffers the event for a single flush at message completion — never writes DB here.
 * Callers must never put raw tool args, file bodies, or unredacted logs in `input`.
 */
export function emitTimelineEvent(
  stream: TimelineChunkSender,
  streamId: string,
  input: TimelineEventInput
): TimelineEvent | null {
  if (stream.isAlive && !stream.isAlive()) return null;
  const event = sanitizeTimelineEvent(input);
  const ok = stream.send({
    type: "timeline",
    streamId,
    event,
  });
  if (!ok) return null;
  const buffer = timelineBuffers.get(streamId) ?? [];
  buffer.push(event);
  timelineBuffers.set(streamId, buffer);
  return event;
}

/**
 * Persist buffered events for a completed assistant message, then drop the buffer.
 * No-op when streamId is unknown or the buffer is empty.
 */
export function flushTimeline(
  streamId: string,
  messageId: string,
  persistence: Pick<AiPersistence, "addTimelineEvents">
): void {
  const events = timelineBuffers.get(streamId);
  timelineBuffers.delete(streamId);
  if (!events?.length || !messageId.trim()) return;
  try {
    persistence.addTimelineEvents(messageId, events);
  } catch {
    // Persistence must not break the live stream.
  }
}

/** Drop buffered events without writing (abort / incomplete stream). */
export function clearTimelineBuffer(streamId: string): void {
  timelineBuffers.delete(streamId);
}

export function peekTimelineBuffer(streamId: string): TimelineEvent[] {
  return [...(timelineBuffers.get(streamId) ?? [])];
}

export function resetTimelineBuffersForTests(): void {
  timelineBuffers.clear();
}
