import type { TimelineEvent } from "../../shared/ai-timeline-contract";
import type {
  ExplainRequest,
  ExplainResult,
  ExplainSelection,
} from "../../shared/ai-explain-contract";
import {
  EXPLAIN_DEBOUNCE_MS,
  EXPLAIN_MAX_SELECTION_BYTES,
  debounceUnlessCancelled,
  normalizeExplainRelPath,
  validateExplainRequestShape,
} from "../../shared/ai-explain-contract";
import { useAIStore } from "../../../ai/composer/ai-store";
import { toWorkspaceRelativePath } from "./quick-fix-client";
import { useEditorStore } from "../store/editor-store";

function generateStreamId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export async function requestExplain(input: {
  filePath: string;
  symbol?: string;
  selection?: ExplainSelection;
  language?: string;
  model?: string;
  abortSignal?: AbortSignal;
}): Promise<{
  streamId: string;
  result: ExplainResult;
  timelineEvents: TimelineEvent[];
}> {
  const projectPath = useEditorStore.getState().projectPath;
  const relPath = toWorkspaceRelativePath(input.filePath, projectPath);
  const streamId = generateStreamId("explain");
  const model = input.model ?? useAIStore.getState().selectedModel ?? "auto-balanced";

  const shaped = validateExplainRequestShape({
    streamId,
    filePath: relPath,
    symbol: input.symbol,
    selection: input.selection,
    language: input.language,
  });
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
  let result: ExplainResult | null = null;
  let settled = false;
  let cleanup: (() => void) | undefined;

  const abortHandler = () => {
    void caval.abortChatStream?.(streamId);
  };
  input.abortSignal?.addEventListener("abort", abortHandler, { once: true });

  try {
    return await new Promise((resolve) => {
      const finish = (next: ExplainResult) => {
        if (settled) return;
        settled = true;
        cleanup?.();
        resolve({ streamId, result: next, timelineEvents });
      };

      cleanup = chatStream(
        {
          message: "explain",
          model,
          mode: "ask",
          streamId,
          skipMultiAgent: true,
          explain: shaped.request,
        },
        (chunk) => {
          if (chunk.type === "timeline" && chunk.event) {
            timelineEvents.push(chunk.event);
          }
          if (chunk.explain) result = chunk.explain;
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

export function publishExplainTimelineToChat(input: {
  content: string;
  timelineEvents: TimelineEvent[];
}): void {
  if (!input.timelineEvents.length) return;
  const msg = {
    id: generateStreamId("explain-msg"),
    role: "assistant" as const,
    content: input.content,
    timestamp: Date.now(),
    timelineEvents: input.timelineEvents,
  };
  useAIStore.setState((s) => {
    const messages = [...s.messages, msg];
    const threads = s.threads.map((t) =>
      t.id === s.activeThreadId ? { ...t, messages, updatedAt: Date.now() } : t
    );
    return { messages, threads };
  });
}

/**
 * Hover path: debounce then explain symbol. Returns null when cancelled.
 * Never mutates the editor model.
 */
export async function explainSymbolWithDebounce(input: {
  filePath: string;
  symbol: string;
  language?: string;
  token: {
    isCancellationRequested: boolean;
    onCancellationRequested?: (listener: () => void) => { dispose: () => void };
  };
  debounceMs?: number;
}): Promise<{ explanation: string; timelineEvents: TimelineEvent[] } | null> {
  const proceeded = await debounceUnlessCancelled(
    input.debounceMs ?? EXPLAIN_DEBOUNCE_MS,
    input.token
  );
  if (!proceeded || input.token.isCancellationRequested) return null;

  const abort = new AbortController();
  const dispose = input.token.onCancellationRequested?.(() => abort.abort());
  try {
    const { result, timelineEvents } = await requestExplain({
      filePath: input.filePath,
      symbol: input.symbol,
      language: input.language,
      abortSignal: abort.signal,
    });
    if (input.token.isCancellationRequested) return null;
    if (!result.success || !result.explanation) return null;
    publishExplainTimelineToChat({
      content: `Explain \`${input.symbol}\` in \`${normalizeExplainRelPath(input.filePath)}\``,
      timelineEvents,
    });
    return { explanation: result.explanation, timelineEvents };
  } finally {
    dispose?.dispose();
  }
}

export function assertSelectionWithinCap(text: string): string | null {
  if (utf8ByteLength(text) > EXPLAIN_MAX_SELECTION_BYTES) {
    return "Selection too large for explain";
  }
  return null;
}

export type { ExplainRequest, ExplainResult, ExplainSelection };
