/**
 * Pas 7c.2 — terminal command suggestions (propose-only; never executes).
 */

import { redactSensitiveCommandOutput } from "../../shared/command-output-redaction";
import {
  buildTerminalSuggestPrompt,
  gateSuggestedCommands,
  parseSuggestedCommands,
  TERMINAL_SUGGEST_TOOL_NAME,
  validateTerminalSuggestRequestShape,
  type TerminalSuggestRequest,
  type TerminalSuggestResult,
} from "../../shared/ai-terminal-contract";
import { emitTimelineEvent, type TimelineChunkSender } from "./timeline-emit";

export type TerminalSuggestCompleteFn = (input: {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  signal?: AbortSignal;
  maxTokens?: number;
}) => Promise<{ ok: true; text: string } | { ok: false; error: string }>;

export function emitTerminalSuggestTimeline(
  stream: TimelineChunkSender,
  streamId: string,
  result: TerminalSuggestResult
): void {
  emitTimelineEvent(stream, streamId, {
    type: "tool_call",
    label: "suggest terminal commands",
    toolName: TERMINAL_SUGGEST_TOOL_NAME,
  });

  if (!result.success) {
    emitTimelineEvent(stream, streamId, {
      type: "tool_result",
      label: "suggest terminal commands failed",
      toolName: TERMINAL_SUGGEST_TOOL_NAME,
      success: false,
      detail: result.error,
    });
    return;
  }

  const n = result.commands?.length ?? 0;
  emitTimelineEvent(stream, streamId, {
    type: "tool_result",
    label: `${n} command${n === 1 ? "" : "s"} suggested`,
    toolName: TERMINAL_SUGGEST_TOOL_NAME,
    success: true,
  });
}

export async function runTerminalSuggest(input: {
  request: TerminalSuggestRequest;
  complete: TerminalSuggestCompleteFn;
  signal?: AbortSignal;
}): Promise<TerminalSuggestResult> {
  const shaped = validateTerminalSuggestRequestShape(input.request);
  if (!shaped.ok) return { success: false, error: shaped.error };

  const { request } = shaped;
  if (input.signal?.aborted) {
    return { success: false, error: "aborted" };
  }

  const prompt = buildTerminalSuggestPrompt({
    context: request.context,
    errorOutput: request.errorOutput
      ? redactSensitiveCommandOutput(request.errorOutput)
      : undefined,
    userQuery: request.userQuery
      ? redactSensitiveCommandOutput(request.userQuery)
      : undefined,
  });

  const completed = await input.complete({
    messages: [
      {
        role: "system",
        content:
          "You suggest shell commands only. Never claim you ran them. Never invent destructive one-liners. Prefer safe diagnostics.",
      },
      { role: "user", content: prompt },
    ],
    signal: input.signal,
    maxTokens: 600,
  });

  if (input.signal?.aborted) {
    return { success: false, error: "aborted" };
  }

  if (!completed.ok) {
    return { success: false, error: completed.error || "Model call failed" };
  }

  const parsed = parseSuggestedCommands(completed.text);
  const commands = gateSuggestedCommands(parsed);
  if (!commands.length) {
    return { success: false, error: "No commands parsed from model response" };
  }
  return { success: true, commands };
}
