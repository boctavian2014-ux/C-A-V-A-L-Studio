/**
 * Chat transcript visibility is fail-closed.
 * Stream chunks are hidden until explicitly classified as assistant_message.
 * Marker/blocklist matching is not a visibility grant.
 */
export const CHAT_STREAM_ITEM_KINDS = [
  "assistant_message",
  "tool_result",
  "internal_prompt",
  "reasoning",
  "recap",
  "agent_progress",
] as const;

export type ChatStreamItemKind = (typeof CHAT_STREAM_ITEM_KINDS)[number];

/** Only this kind may enter the visible chat transcript. */
export function isTranscriptVisibleKind(kind: unknown): kind is "assistant_message" {
  return kind === "assistant_message";
}

/** Extract transcript text from a stream chunk. Unclassified / non-assistant → empty. */
export function transcriptTextFromStreamChunk(chunk: {
  type?: string;
  delta?: string;
  kind?: unknown;
}): string {
  if (chunk.type !== "delta") return "";
  const delta = chunk.delta;
  if (typeof delta !== "string" || !delta) return "";
  if (!isTranscriptVisibleKind(chunk.kind)) return "";
  return delta;
}
