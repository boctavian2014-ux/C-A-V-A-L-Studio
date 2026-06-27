/** Extract reasoning text from OpenRouter / provider SSE delta objects. */
export function extractReasoningFromDelta(delta: Record<string, unknown> | undefined): string {
  if (!delta) return "";

  const direct =
    (typeof delta.reasoning === "string" && delta.reasoning) ||
    (typeof delta.reasoning_content === "string" && delta.reasoning_content) ||
    "";
  if (direct) return direct;

  const details = delta.reasoning_details as
    | Array<{ type?: string; text?: string; summary?: string }>
    | undefined;
  if (!details?.length) return "";

  return details
    .map((item) => {
      if (item.text) return item.text;
      if (item.summary) return item.summary;
      return "";
    })
    .join("");
}
