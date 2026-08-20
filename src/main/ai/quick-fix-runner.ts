/**
 * Pas 6.1 — propose localized quick-fix edits (main never writes disk).
 */

import fs from "node:fs";
import path from "node:path";

import { isSensitiveFile, sanitizeIdeText } from "../../shared/ai-context-security";
import {
  buildQuickFixPrompt,
  normalizeQuickFixRelPath,
  parseQuickFixAiResponse,
  QUICK_FIX_TOOL_NAME,
  sliceFileContext,
  validateQuickFixRequestShape,
  type QuickFixAcceptRequest,
  type QuickFixRequest,
  type QuickFixResult,
} from "../../shared/ai-quick-fix-contract";
import { resolveSandboxedWorkspacePath } from "../path-security";
import { emitTimelineEvent, type TimelineChunkSender } from "./timeline-emit";

export type QuickFixCompleteFn = (input: {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  signal?: AbortSignal;
  maxTokens?: number;
  jsonMode?: boolean;
}) => Promise<{ ok: true; text: string } | { ok: false; error: string }>;

const MAX_FILE_CHARS = 200_000;

export function formatQuickFixToolLabel(filePath: string, line: number): string {
  const rel = normalizeQuickFixRelPath(filePath);
  return `${rel}:${line}`;
}

export async function proposeQuickFix(input: {
  workspaceRoot: string;
  request: QuickFixRequest;
  complete: QuickFixCompleteFn;
  signal?: AbortSignal;
}): Promise<QuickFixResult> {
  const shaped = validateQuickFixRequestShape(input.request);
  if (!shaped.ok) return { success: false, error: shaped.error };

  const { request } = shaped;
  if (!input.workspaceRoot?.trim()) {
    return { success: false, error: "No bound workspace" };
  }

  if (isSensitiveFile(request.filePath)) {
    return { success: false, error: "Quick fix blocked for sensitive file" };
  }

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

  let content: string;
  try {
    content = fs.readFileSync(absPath, "utf8");
  } catch {
    return { success: false, error: "Failed to read file" };
  }
  if (content.length > MAX_FILE_CHARS) {
    return { success: false, error: "File too large for quick fix" };
  }

  const lineCount = content.split("\n").length;
  if (request.diagnostic.startLine > lineCount) {
    return { success: false, error: "Diagnostic out of file range" };
  }

  const { snippet, startLine } = sliceFileContext(content, request.diagnostic);
  const languageHint = path.extname(request.filePath).replace(/^\./, "") || undefined;
  const prompt = buildQuickFixPrompt({
    filePath: request.filePath,
    languageHint,
    diagnostic: request.diagnostic,
    contextSnippet: sanitizeIdeText(snippet),
    contextStartLine: startLine,
  });

  const completed = await input.complete({
    messages: [
      {
        role: "system",
        content:
          "You propose minimal diagnostic fixes as JSON only. Never include secrets or unrelated rewrites.",
      },
      { role: "user", content: prompt },
    ],
    signal: input.signal,
    maxTokens: 1200,
    jsonMode: true,
  });

  if (!completed.ok) {
    return { success: false, error: completed.error || "Model call failed" };
  }

  return parseQuickFixAiResponse(sanitizeIdeText(completed.text), request.diagnostic);
}

export function emitQuickFixProposeTimeline(
  stream: TimelineChunkSender,
  streamId: string,
  filePath: string,
  diagnosticLine: number,
  result: QuickFixResult
): void {
  const loc = formatQuickFixToolLabel(filePath, diagnosticLine);
  emitTimelineEvent(stream, streamId, {
    type: "tool_call",
    label: `${QUICK_FIX_TOOL_NAME} ${loc}`,
    toolName: QUICK_FIX_TOOL_NAME,
  });

  if (!result.success) {
    emitTimelineEvent(stream, streamId, {
      type: "tool_result",
      label: `${QUICK_FIX_TOOL_NAME} failed`,
      toolName: QUICK_FIX_TOOL_NAME,
      success: false,
      detail: result.error,
    });
    emitTimelineEvent(stream, streamId, {
      type: "error",
      label: "Quick fix rejected",
      toolName: QUICK_FIX_TOOL_NAME,
      success: false,
      detail: result.error,
    });
    return;
  }

  const count = result.edits?.length ?? 0;
  emitTimelineEvent(stream, streamId, {
    type: "tool_result",
    label: `${count} edit${count === 1 ? "" : "s"} proposed`,
    toolName: QUICK_FIX_TOOL_NAME,
    success: true,
    detail: result.explanation,
  });
}

export function emitQuickFixAcceptTimeline(
  stream: TimelineChunkSender,
  streamId: string,
  accept: QuickFixAcceptRequest
): QuickFixResult {
  const filePath = normalizeQuickFixRelPath(accept.filePath);
  if (!filePath) {
    const error = "Invalid filePath";
    emitTimelineEvent(stream, streamId, {
      type: "error",
      label: "Quick fix accept failed",
      success: false,
      detail: error,
    });
    return { success: false, error };
  }

  emitTimelineEvent(stream, streamId, {
    type: "file_write",
    label: `Updated ${filePath}`,
    filePath,
    success: true,
    detail:
      typeof accept.editCount === "number" && accept.editCount > 0
        ? `${accept.editCount} edit${accept.editCount === 1 ? "" : "s"} applied`
        : undefined,
  });

  return { success: true };
}
