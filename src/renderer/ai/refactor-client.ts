import type { TimelineEvent } from "../../shared/ai-timeline-contract";
import type {
  RefactorKind,
  RefactorRequest,
  RefactorResult,
  RefactorSelection,
} from "../../shared/ai-refactor-contract";
import { useAIStore } from "../../../ai/composer/ai-store";

function generateStreamId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function requestRefactor(input: {
  kind: RefactorKind;
  symbol?: string;
  selection?: RefactorSelection;
  instruction?: string;
  model?: string;
}): Promise<{
  streamId: string;
  result: RefactorResult;
  timelineEvents: TimelineEvent[];
}> {
  const streamId = generateStreamId("refactor");
  const model = input.model ?? useAIStore.getState().selectedModel ?? "auto-balanced";
  const refactor: RefactorRequest = {
    streamId,
    kind: input.kind,
    ...(input.symbol ? { symbol: input.symbol } : {}),
    ...(input.selection ? { selection: input.selection } : {}),
    ...(input.instruction ? { instruction: input.instruction } : {}),
  };

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
  let result: RefactorResult | null = null;
  let settled = false;

  return new Promise((resolve) => {
    const finish = (next: RefactorResult) => {
      if (settled) return;
      settled = true;
      cleanup?.();
      resolve({ streamId, result: next, timelineEvents });
    };

    const cleanup = chatStream(
      {
        message: "refactor",
        model,
        mode: "code",
        streamId,
        skipMultiAgent: true,
        refactor,
      },
      (chunk) => {
        if (chunk.type === "timeline" && chunk.event) {
          timelineEvents.push(chunk.event);
        }
        if (chunk.refactor) result = chunk.refactor;
        if (chunk.type === "done") {
          finish(result ?? { success: false, error: "Empty refactor response" });
        }
        if (chunk.type === "error") {
          finish(
            result ?? {
              success: false,
              error: chunk.error ?? "Refactor failed",
            }
          );
        }
      }
    );

    window.setTimeout(() => {
      finish(result ?? { success: false, error: "Refactor timed out" });
    }, 90_000);
  });
}

export function publishRefactorTimelineToChat(input: {
  content: string;
  timelineEvents: TimelineEvent[];
  writtenFiles?: string[];
}): void {
  const msg = {
    id: generateStreamId("refactor-msg"),
    role: "assistant" as const,
    content: input.content,
    timestamp: Date.now(),
    timelineEvents: input.timelineEvents,
    ...(input.writtenFiles?.length ? { writtenFiles: input.writtenFiles } : {}),
  };
  useAIStore.setState((s) => {
    const messages = [...s.messages, msg];
    const threads = s.threads.map((t) =>
      t.id === s.activeThreadId ? { ...t, messages, updatedAt: Date.now() } : t
    );
    return { messages, threads };
  });
}
