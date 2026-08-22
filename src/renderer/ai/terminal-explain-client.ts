import type { TimelineEvent } from "../../shared/ai-timeline-contract";
import type {
  TerminalExplainRequest,
  TerminalExplainResult,
} from "../../shared/ai-terminal-contract";
import {
  TERMINAL_EXPLAIN_MAX_SELECTION_BYTES,
  TERMINAL_EXPLAIN_MAX_SCROLLBACK_BYTES,
  utf8ByteLength,
  validateTerminalExplainRequestShape,
} from "../../shared/ai-terminal-contract";
import { useAIStore } from "../../../ai/composer/ai-store";

function generateStreamId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function requestTerminalExplain(input: {
  terminalId: string;
  selectedText: string;
  scrollbackContext?: string;
  model?: string;
  abortSignal?: AbortSignal;
}): Promise<{
  streamId: string;
  result: TerminalExplainResult;
  timelineEvents: TimelineEvent[];
}> {
  const streamId = generateStreamId("term-explain");
  const model = input.model ?? useAIStore.getState().selectedModel ?? "auto-balanced";

  const shaped = validateTerminalExplainRequestShape({
    streamId,
    terminalId: input.terminalId,
    selectedText: input.selectedText,
    scrollbackContext: input.scrollbackContext,
  } satisfies TerminalExplainRequest);
  if (!shaped.ok) {
    return {
      streamId,
      result: { success: false, error: shaped.error },
      timelineEvents: [],
    };
  }

  const caval = window.caval;
  const chatStream = caval?.chatStream;
  if (!chatStream) {
    return {
      streamId,
      result: { success: false, error: "AI stream unavailable" },
      timelineEvents: [],
    };
  }

  const timelineEvents: TimelineEvent[] = [];
  let result: TerminalExplainResult | null = null;
  let settled = false;
  let cleanup: (() => void) | undefined;

  const abortHandler = () => {
    void caval.abortChatStream?.(streamId);
  };
  input.abortSignal?.addEventListener("abort", abortHandler, { once: true });

  try {
    return await new Promise((resolve) => {
      const finish = (next: TerminalExplainResult) => {
        if (settled) return;
        settled = true;
        cleanup?.();
        resolve({ streamId, result: next, timelineEvents });
      };

      cleanup = chatStream(
        {
          message: "explain terminal output",
          model,
          mode: "ask",
          streamId,
          skipMultiAgent: true,
          terminalExplain: shaped.request,
        },
        (chunk) => {
          if (chunk.type === "timeline" && chunk.event) {
            timelineEvents.push(chunk.event);
          }
          if (chunk.terminalExplain) result = chunk.terminalExplain;
          if (chunk.type === "done") {
            finish(result ?? { success: false, error: "Empty explain response" });
          }
          if (chunk.type === "error") {
            finish(
              result ?? {
                success: false,
                error: chunk.error ?? "Explain failed",
              }
            );
          }
        }
      );

      window.setTimeout(() => {
        finish(result ?? { success: false, error: "Explain timed out" });
      }, 60_000);
    });
  } finally {
    input.abortSignal?.removeEventListener("abort", abortHandler);
  }
}

export function assertTerminalSelectionWithinCap(text: string): string | null {
  if (!text.trim()) return "Select terminal output to explain";
  if (utf8ByteLength(text) > TERMINAL_EXPLAIN_MAX_SELECTION_BYTES) {
    return "Selection too large for explain";
  }
  return null;
}

export function assertTerminalScrollbackWithinCap(_text: string | undefined): string | null {
  // Scrollback oversize is truncated in main terminal-redaction (7c.3) — never hard-reject here.
  return null;
}

/** Build optional scrollback from nearby lines, hard-capped (never silent-oversize). */
export function buildScrollbackContext(
  lines: string[],
  maxBytes = TERMINAL_EXPLAIN_MAX_SCROLLBACK_BYTES
): string | undefined {
  if (!lines.length) return undefined;
  const joined: string[] = [];
  let size = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i] ?? "";
    const next = size === 0 ? line : `${line}\n${joined[0]}`;
    const bytes = utf8ByteLength(next);
    if (bytes > maxBytes) break;
    joined.unshift(line);
    size = bytes;
  }
  const out = joined.join("\n").trim();
  return out || undefined;
}

export type { TerminalExplainResult };
