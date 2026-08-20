import type { TimelineEvent } from "../../shared/ai-timeline-contract";
import { normalizeQuickFixRelPath } from "../../shared/ai-quick-fix-contract";
import { useAIStore } from "../../../ai/composer/ai-store";

function generateStreamId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Emit file_write on the existing 5.4 stream channel after an explicit editor accept
 * (inline completion Tab, etc.). Main does not write disk.
 */
export async function emitEditorFileWriteTimeline(input: {
  filePath: string;
  detail?: string;
  model?: string;
}): Promise<{ success: boolean; timelineEvents: TimelineEvent[]; error?: string }> {
  const caval = window.caval;
  const chatStream = caval?.chatStream;
  if (!chatStream) {
    return { success: false, timelineEvents: [], error: "AI stream unavailable" };
  }

  const streamId = generateStreamId("ic-accept");
  const model = input.model ?? useAIStore.getState().selectedModel ?? "auto-balanced";
  const filePath = normalizeQuickFixRelPath(input.filePath);
  const timelineEvents: TimelineEvent[] = [];
  let success = false;
  let error: string | undefined;
  let settled = false;

  return new Promise((resolve) => {
    const finish = (ok: boolean, err?: string) => {
      if (settled) return;
      settled = true;
      cleanup?.();
      resolve({ success: ok, timelineEvents, error: err });
    };

    const cleanup = chatStream(
      {
        message: "inline-completion-accept",
        model,
        mode: "code",
        streamId,
        skipMultiAgent: true,
        timelineFileWrite: {
          filePath,
          detail: input.detail ?? "inline completion accepted",
        },
      },
      (chunk) => {
        if (chunk.type === "timeline" && chunk.event) {
          timelineEvents.push(chunk.event);
        }
        if (chunk.type === "done") {
          success = true;
          finish(true);
        }
        if (chunk.type === "error") {
          error = chunk.error ?? "Timeline emit failed";
          finish(false, error);
        }
      }
    );

    window.setTimeout(() => finish(success, error ?? "Timeline emit timed out"), 15_000);
  });
}

export function publishInlineCompletionAcceptToChat(input: {
  filePath: string;
  timelineEvents: TimelineEvent[];
}): void {
  const rel = normalizeQuickFixRelPath(input.filePath);
  const msg = {
    id: generateStreamId("ic-msg"),
    role: "assistant" as const,
    content: `Inline completion accepted in \`${rel}\``,
    timestamp: Date.now(),
    timelineEvents: input.timelineEvents,
    writtenFiles: [rel],
  };
  useAIStore.setState((s) => {
    const messages = [...s.messages, msg];
    const threads = s.threads.map((t) =>
      t.id === s.activeThreadId ? { ...t, messages, updatedAt: Date.now() } : t
    );
    return { messages, threads };
  });
}
