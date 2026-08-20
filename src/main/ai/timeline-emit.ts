import {
  sanitizeTimelineEvent,
  type TimelineEvent,
  type TimelineEventInput,
} from "../../shared/ai-timeline-contract";

export type TimelineChunkSender = {
  send: (chunk: Record<string, unknown>) => boolean;
  isAlive?: () => boolean;
};

/**
 * Build a sanitized timeline event and push it on the existing AI stream channel.
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
  return ok ? event : null;
}
