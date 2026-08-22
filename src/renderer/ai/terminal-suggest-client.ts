import type { TimelineEvent } from "../../shared/ai-timeline-contract";
import type {
  SuggestedCommand,
  TerminalSuggestContext,
  TerminalSuggestRequest,
  TerminalSuggestResult,
} from "../../shared/ai-terminal-contract";
import {
  TERMINAL_SUGGEST_MAX_ERROR_BYTES,
  utf8ByteLength,
  validateTerminalSuggestRequestShape,
} from "../../shared/ai-terminal-contract";
import { useAIStore } from "../../../ai/composer/ai-store";

export const TERMINAL_INSERT_COMMAND_EVENT = "caval:terminal-insert-command";

function generateStreamId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Strip newlines so insert never submits/executes. */
export function normalizeCommandForInsert(command: string): string {
  return command.replace(/[\r\n]+/g, " ").trim();
}

/** Insert into the active TerminalInput prompt — never appends Enter / never executes. */
export function insertCommandIntoTerminalPrompt(command: string): void {
  const trimmed = normalizeCommandForInsert(command);
  if (!trimmed) return;
  if (typeof document === "undefined") return;
  document.dispatchEvent(
    new CustomEvent(TERMINAL_INSERT_COMMAND_EVENT, {
      detail: { command: trimmed },
    })
  );
}

export async function requestTerminalSuggest(input: {
  context: TerminalSuggestContext;
  terminalId?: string;
  errorOutput?: string;
  userQuery?: string;
  model?: string;
  abortSignal?: AbortSignal;
}): Promise<{
  streamId: string;
  result: TerminalSuggestResult;
  timelineEvents: TimelineEvent[];
}> {
  const streamId = generateStreamId("term-suggest");
  const model = input.model ?? useAIStore.getState().selectedModel ?? "auto-balanced";

  const shaped = validateTerminalSuggestRequestShape({
    streamId,
    context: input.context,
    terminalId: input.terminalId,
    errorOutput: input.errorOutput,
    userQuery: input.userQuery,
  } satisfies TerminalSuggestRequest);

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
  let result: TerminalSuggestResult | null = null;
  let settled = false;
  let cleanup: (() => void) | undefined;

  const abortHandler = () => {
    void caval.abortChatStream?.(streamId);
  };
  input.abortSignal?.addEventListener("abort", abortHandler, { once: true });

  try {
    return await new Promise((resolve) => {
      const finish = (next: TerminalSuggestResult) => {
        if (settled) return;
        settled = true;
        cleanup?.();
        resolve({ streamId, result: next, timelineEvents });
      };

      cleanup = chatStream(
        {
          message: "suggest terminal commands",
          model,
          mode: "ask",
          streamId,
          skipMultiAgent: true,
          terminalSuggest: shaped.request,
        },
        (chunk) => {
          if (chunk.type === "timeline" && chunk.event) {
            timelineEvents.push(chunk.event);
          }
          if (chunk.terminalSuggest) result = chunk.terminalSuggest;
          if (chunk.type === "done") {
            finish(result ?? { success: false, error: "Empty suggest response" });
          }
          if (chunk.type === "error") {
            finish(
              result ?? {
                success: false,
                error: chunk.error ?? "Suggest failed",
              }
            );
          }
        }
      );

      window.setTimeout(() => {
        finish(result ?? { success: false, error: "Suggest timed out" });
      }, 60_000);
    });
  } finally {
    input.abortSignal?.removeEventListener("abort", abortHandler);
  }
}

export function assertSuggestErrorWithinCap(text: string | undefined): string | null {
  if (!text) return null;
  if (utf8ByteLength(text) > TERMINAL_SUGGEST_MAX_ERROR_BYTES) {
    return "Error output too large for suggest";
  }
  return null;
}

export type { SuggestedCommand, TerminalSuggestResult };
