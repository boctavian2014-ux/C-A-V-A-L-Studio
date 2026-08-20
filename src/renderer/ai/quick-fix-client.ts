import type { TimelineEvent } from "../../shared/ai-timeline-contract";
import type {
  QuickFixDiagnostic,
  QuickFixEdit,
  QuickFixResult,
} from "../../shared/ai-quick-fix-contract";
import { normalizeQuickFixRelPath } from "../../shared/ai-quick-fix-contract";
import type { Problem } from "../../shared/problems-contract";
import { useAIStore } from "../../../ai/composer/ai-store";

function generateStreamId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function problemToQuickFixDiagnostic(problem: Problem): QuickFixDiagnostic | null {
  const severity =
    problem.severity === "error" || problem.severity === "warning"
      ? problem.severity
      : null;
  if (!severity) return null;
  return {
    message: problem.message,
    severity,
    startLine: problem.line,
    startColumn: problem.column,
    endLine: problem.endLine ?? problem.line,
    endColumn: problem.endColumn ?? Math.max(problem.column + 1, problem.column),
    source: problem.source,
    code: problem.code,
  };
}

export function toWorkspaceRelativePath(filePath: string, projectPath: string | null): string {
  const normalized = filePath.replace(/\\/g, "/");
  if (!projectPath) return normalizeQuickFixRelPath(normalized);
  const root = projectPath.replace(/\\/g, "/").replace(/\/+$/, "");
  if (normalized.toLowerCase().startsWith(root.toLowerCase() + "/")) {
    return normalizeQuickFixRelPath(normalized.slice(root.length + 1));
  }
  return normalizeQuickFixRelPath(normalized);
}

function runQuickFixStream(input: {
  streamId: string;
  model: string;
  quickFix?: import("../../shared/ai-quick-fix-contract").QuickFixRequest;
  quickFixAccept?: import("../../shared/ai-quick-fix-contract").QuickFixAcceptRequest;
}): Promise<{
  result: QuickFixResult;
  timelineEvents: TimelineEvent[];
}> {
  const caval = window.caval;
  const chatStream = caval?.chatStream;
  if (!chatStream) {
    return Promise.resolve({
      result: { success: false, error: "AI stream unavailable" },
      timelineEvents: [],
    });
  }

  const timelineEvents: TimelineEvent[] = [];
  let result: QuickFixResult | null = null;
  let settled = false;

  return new Promise((resolve) => {
    const finish = (next: QuickFixResult) => {
      if (settled) return;
      settled = true;
      cleanup?.();
      resolve({ result: next, timelineEvents });
    };

    const cleanup = chatStream(
      {
        message: input.quickFixAccept ? "quick-fix-accept" : "quick-fix",
        model: input.model,
        mode: "code",
        streamId: input.streamId,
        skipMultiAgent: true,
        ...(input.quickFix ? { quickFix: input.quickFix } : {}),
        ...(input.quickFixAccept ? { quickFixAccept: input.quickFixAccept } : {}),
      },
      (chunk) => {
        if (chunk.type === "timeline" && chunk.event) {
          timelineEvents.push(chunk.event);
        }
        if (chunk.quickFix) {
          result = chunk.quickFix;
        }
        if (chunk.type === "done") {
          finish(result ?? { success: true });
        }
        if (chunk.type === "error") {
          finish(
            result ?? {
              success: false,
              error: chunk.error ?? "Quick fix failed",
            }
          );
        }
      }
    );

    window.setTimeout(() => {
      finish(result ?? { success: false, error: "Quick fix timed out" });
    }, 90_000);
  });
}

export async function proposeQuickFixFromProblem(input: {
  filePath: string;
  diagnostic: QuickFixDiagnostic;
  model?: string;
}): Promise<{
  streamId: string;
  result: QuickFixResult;
  timelineEvents: TimelineEvent[];
}> {
  const streamId = generateStreamId("qf");
  const model = input.model ?? useAIStore.getState().selectedModel ?? "auto-balanced";
  const { result, timelineEvents } = await runQuickFixStream({
    streamId,
    model,
    quickFix: {
      streamId,
      filePath: normalizeQuickFixRelPath(input.filePath),
      diagnostic: input.diagnostic,
    },
  });
  return { streamId, result, timelineEvents };
}

export async function acceptQuickFixTimeline(input: {
  filePath: string;
  editCount: number;
  model?: string;
}): Promise<{ result: QuickFixResult; timelineEvents: TimelineEvent[] }> {
  const streamId = generateStreamId("qf-accept");
  const model = input.model ?? useAIStore.getState().selectedModel ?? "auto-balanced";
  return runQuickFixStream({
    streamId,
    model,
    quickFixAccept: {
      filePath: normalizeQuickFixRelPath(input.filePath),
      editCount: input.editCount,
    },
  });
}

export function publishQuickFixTimelineToChat(input: {
  content: string;
  timelineEvents: TimelineEvent[];
  writtenFiles?: string[];
}): void {
  const msg = {
    id: generateStreamId("qf-msg"),
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

export type { QuickFixEdit, QuickFixResult };
