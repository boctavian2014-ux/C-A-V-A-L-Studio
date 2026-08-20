/**
 * Pas 7c.1 — terminal output explain runner (read-only; never writes PTY/disk).
 * Redaction via terminal-redaction.ts only (7c.3).
 */

import {
  buildTerminalExplainPrompt,
  TERMINAL_EXPLAIN_MAX_SCROLLBACK_BYTES,
  TERMINAL_EXPLAIN_MAX_SELECTION_BYTES,
  TERMINAL_EXPLAIN_TOOL_NAME,
  validateTerminalExplainRequestShape,
  type TerminalExplainRequest,
  type TerminalExplainResult,
} from "../../shared/ai-terminal-contract";
import {
  redactTerminalContent,
  redactTerminalResponse,
  TerminalContentTooLargeError,
} from "./terminal-redaction";
import { emitTimelineEvent, type TimelineChunkSender } from "./timeline-emit";

export type TerminalExplainCompleteFn = (input: {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  signal?: AbortSignal;
  maxTokens?: number;
}) => Promise<{ ok: true; text: string } | { ok: false; error: string }>;

export function emitTerminalExplainTimeline(
  stream: TimelineChunkSender,
  streamId: string,
  terminalId: string,
  result: TerminalExplainResult
): void {
  emitTimelineEvent(stream, streamId, {
    type: "tool_call",
    label: `explain terminal output · ${terminalId}`,
    toolName: TERMINAL_EXPLAIN_TOOL_NAME,
  });

  if (!result.success) {
    emitTimelineEvent(stream, streamId, {
      type: "tool_result",
      label: "explain terminal output failed",
      toolName: TERMINAL_EXPLAIN_TOOL_NAME,
      success: false,
      detail: result.error,
    });
    return;
  }

  emitTimelineEvent(stream, streamId, {
    type: "tool_result",
    label: "Terminal output explained",
    toolName: TERMINAL_EXPLAIN_TOOL_NAME,
    success: true,
    detail: result.explanation ? result.explanation.slice(0, 120) : undefined,
  });
}

export async function runTerminalExplain(input: {
  request: TerminalExplainRequest;
  complete: TerminalExplainCompleteFn;
  signal?: AbortSignal;
}): Promise<TerminalExplainResult> {
  const shaped = validateTerminalExplainRequestShape(input.request);
  if (!shaped.ok) return { success: false, error: shaped.error };

  const { request } = shaped;
  if (input.signal?.aborted) {
    return { success: false, error: "aborted" };
  }

  let safeSelection: string;
  let safeScrollback: string | undefined;
  try {
    safeSelection = redactTerminalContent(request.selectedText, {
      context: "selection",
      maxBytes: TERMINAL_EXPLAIN_MAX_SELECTION_BYTES,
    });
    if (request.scrollbackContext) {
      safeScrollback = redactTerminalContent(request.scrollbackContext, {
        context: "scrollback",
        maxBytes: TERMINAL_EXPLAIN_MAX_SCROLLBACK_BYTES,
      });
    }
  } catch (err) {
    if (err instanceof TerminalContentTooLargeError) {
      return {
        success: false,
        error: err.context === "selection" ? "Selection too large" : err.message,
      };
    }
    throw err;
  }

  const prompt = buildTerminalExplainPrompt({
    selection: safeSelection,
    scrollback: safeScrollback,
  });

  const completed = await input.complete({
    messages: [
      {
        role: "system",
        content:
          "You explain terminal/build output clearly and briefly. Never output diffs, patches, JSON edits, or shell commands meant to auto-run.",
      },
      { role: "user", content: prompt },
    ],
    signal: input.signal,
    maxTokens: 900,
  });

  if (input.signal?.aborted) {
    return { success: false, error: "aborted" };
  }

  if (!completed.ok) {
    return { success: false, error: completed.error || "Model call failed" };
  }

  const explanation = redactTerminalResponse(completed.text);
  if (!explanation) {
    return { success: false, error: "Empty or invalid explanation" };
  }
  return { success: true, explanation };
}
