/**
 * Pas 6.3 — explain runner (read-only; main never writes disk or returns edits).
 */

import fs from "node:fs";

import { isSensitiveFile, sanitizeIdeText } from "../../shared/ai-context-security";
import {
  buildExplainPrompt,
  EXPLAIN_TOOL_NAME,
  normalizeExplainRelPath,
  sanitizeExplainText,
  sliceExplainContext,
  validateExplainRequestShape,
  type ExplainRequest,
  type ExplainResult,
} from "../../shared/ai-explain-contract";
import { resolveSandboxedWorkspacePath } from "../path-security";
import { emitTimelineEvent, type TimelineChunkSender } from "./timeline-emit";

export type ExplainCompleteFn = (input: {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  signal?: AbortSignal;
  maxTokens?: number;
}) => Promise<{ ok: true; text: string } | { ok: false; error: string }>;

const MAX_FILE_CHARS = 200_000;

export function emitExplainTimeline(
  stream: TimelineChunkSender,
  streamId: string,
  filePath: string,
  result: ExplainResult,
  focusLabel: string
): void {
  const rel = normalizeExplainRelPath(filePath);
  emitTimelineEvent(stream, streamId, {
    type: "tool_call",
    label: `${EXPLAIN_TOOL_NAME} ${rel}${focusLabel ? ` · ${focusLabel}` : ""}`,
    toolName: EXPLAIN_TOOL_NAME,
  });

  if (!result.success) {
    emitTimelineEvent(stream, streamId, {
      type: "tool_result",
      label: `${EXPLAIN_TOOL_NAME} failed`,
      toolName: EXPLAIN_TOOL_NAME,
      success: false,
      detail: result.error,
    });
    return;
  }

  emitTimelineEvent(stream, streamId, {
    type: "tool_result",
    label: `${EXPLAIN_TOOL_NAME} ready`,
    toolName: EXPLAIN_TOOL_NAME,
    success: true,
    detail: result.explanation ? result.explanation.slice(0, 120) : undefined,
  });
}

export async function runExplain(input: {
  workspaceRoot: string;
  request: ExplainRequest;
  complete: ExplainCompleteFn;
  signal?: AbortSignal;
  /** Optional file body from caller; when omitted, main reads from disk. */
  fileContent?: string;
}): Promise<ExplainResult> {
  const shaped = validateExplainRequestShape(input.request);
  if (!shaped.ok) return { success: false, error: shaped.error };

  const { request } = shaped;
  if (!input.workspaceRoot?.trim()) {
    return { success: false, error: "No bound workspace" };
  }
  if (isSensitiveFile(request.filePath)) {
    return { success: false, error: "Explain blocked for sensitive file" };
  }

  let content = input.fileContent;
  if (content == null) {
    let absPath: string;
    try {
      absPath = resolveSandboxedWorkspacePath(input.workspaceRoot, request.filePath);
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Path outside workspace",
      };
    }
    if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
      return { success: false, error: "File not found" };
    }
    try {
      content = fs.readFileSync(absPath, "utf8");
    } catch {
      return { success: false, error: "Failed to read file" };
    }
  }

  if (content.length > MAX_FILE_CHARS) {
    return { success: false, error: "File too large for explain" };
  }

  const center = request.selection
    ? { startLine: request.selection.startLine, endLine: request.selection.endLine }
    : (() => {
        const lines = content!.split("\n");
        const idx = request.symbol
          ? lines.findIndex((l) => l.includes(request.symbol!))
          : 0;
        const line = idx >= 0 ? idx + 1 : 1;
        return { startLine: line, endLine: line };
      })();

  const { snippet, startLine } = sliceExplainContext(content, center);
  const prompt = buildExplainPrompt({
    filePath: request.filePath,
    language: request.language,
    symbol: request.symbol,
    selectionText: request.selection?.text,
    contextSnippet: snippet,
    contextStartLine: startLine,
  });

  const completed = await input.complete({
    messages: [
      {
        role: "system",
        content:
          "You explain code clearly and briefly. Never output diffs, patches, or JSON edits.",
      },
      { role: "user", content: prompt },
    ],
    signal: input.signal,
    maxTokens: 900,
  });

  if (!completed.ok) {
    return { success: false, error: completed.error || "Model call failed" };
  }

  const explanation = sanitizeExplainText(sanitizeIdeText(completed.text));
  if (!explanation) {
    return { success: false, error: "Empty or invalid explanation" };
  }
  return { success: true, explanation };
}
