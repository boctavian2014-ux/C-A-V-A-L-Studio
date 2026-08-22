/**
 * Pas 6.5 — multi-file refactor propose (main never writes disk).
 */

import fs from "node:fs";
import path from "node:path";

import { isSensitiveFile, sanitizeIdeText } from "../../shared/ai-context-security";
import {
  buildRefactorPrompt,
  normalizeRefactorPath,
  parseRefactorAiResponse,
  REFACTOR_MAX_FILES,
  REFACTOR_TOOL_NAME,
  sliceRefactorContext,
  validateRefactorRequestShape,
  type RefactorRequest,
  type RefactorResult,
} from "../../shared/ai-refactor-contract";
import { resolveSandboxedWorkspacePath } from "../path-security";
import { emitTimelineEvent, type TimelineChunkSender } from "./timeline-emit";

export type RefactorCompleteFn = (input: {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  signal?: AbortSignal;
  maxTokens?: number;
  jsonMode?: boolean;
}) => Promise<{ ok: true; text: string } | { ok: false; error: string }>;

const MAX_FILE_CHARS = 200_000;

function listCandidateFiles(workspaceRoot: string, request: RefactorRequest): string[] {
  const out: string[] = [];
  if (request.selection?.filePath) {
    out.push(normalizeRefactorPath(request.selection.filePath));
  }
  // Prefer same directory siblings for rename/move context (bounded).
  const anchor = out[0];
  if (anchor) {
    try {
      const abs = resolveSandboxedWorkspacePath(workspaceRoot, path.dirname(anchor) || ".");
      if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
        const entries = fs.readdirSync(abs).filter((n) => /\.(ts|tsx|js|jsx)$/i.test(n));
        for (const name of entries.slice(0, REFACTOR_MAX_FILES)) {
          const rel = normalizeRefactorPath(path.join(path.dirname(anchor), name));
          if (!out.includes(rel)) out.push(rel);
        }
      }
    } catch {
      // ignore
    }
  }
  return out.slice(0, REFACTOR_MAX_FILES);
}

export function emitRefactorProposeTimeline(
  stream: TimelineChunkSender,
  streamId: string,
  request: RefactorRequest,
  result: RefactorResult
): void {
  const focus =
    request.kind === "rename"
      ? `rename ${request.symbol ?? request.selection?.text ?? ""}`.trim()
      : request.kind;
  emitTimelineEvent(stream, streamId, {
    type: "tool_call",
    label: `${REFACTOR_TOOL_NAME} ${focus}`.slice(0, 160),
    toolName: REFACTOR_TOOL_NAME,
  });

  if (!result.success) {
    emitTimelineEvent(stream, streamId, {
      type: "tool_result",
      label: `${REFACTOR_TOOL_NAME} failed`,
      toolName: REFACTOR_TOOL_NAME,
      success: false,
      detail: result.error,
    });
    return;
  }

  const fileCount = result.files?.length ?? 0;
  const editCount =
    result.files?.reduce((n, f) => n + (f.edits?.length ?? 0), 0) ?? 0;
  emitTimelineEvent(stream, streamId, {
    type: "tool_result",
    label: `${fileCount} file${fileCount === 1 ? "" : "s"}, ${editCount} edit${editCount === 1 ? "" : "s"} proposed`,
    toolName: REFACTOR_TOOL_NAME,
    success: true,
    detail: result.explanation,
  });
}

export async function runRefactorPropose(input: {
  workspaceRoot: string;
  request: RefactorRequest;
  complete: RefactorCompleteFn;
  signal?: AbortSignal;
}): Promise<RefactorResult> {
  const shaped = validateRefactorRequestShape(input.request);
  if (!shaped.ok) return { success: false, error: shaped.error };
  const { request } = shaped;

  if (!input.workspaceRoot?.trim()) {
    return { success: false, error: "No bound workspace" };
  }

  const candidates = listCandidateFiles(input.workspaceRoot, request);
  if (!candidates.length) {
    return { success: false, error: "No files to refactor" };
  }

  const snippets: Array<{ path: string; snippet: string; startLine: number }> = [];
  for (const rel of candidates) {
    if (isSensitiveFile(rel)) continue;
    let abs: string;
    try {
      abs = resolveSandboxedWorkspacePath(input.workspaceRoot, rel);
    } catch {
      continue;
    }
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
    let content: string;
    try {
      content = fs.readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    if (content.length > MAX_FILE_CHARS) continue;
    const center =
      request.selection && normalizeRefactorPath(request.selection.filePath) === rel
        ? request.selection.startLine
        : request.symbol
          ? Math.max(1, content.split("\n").findIndex((l) => l.includes(request.symbol!)) + 1)
          : 1;
    const sliced = sliceRefactorContext(content, center || 1);
    snippets.push({ path: rel, snippet: sliced.snippet, startLine: sliced.startLine });
  }

  if (!snippets.length) {
    return { success: false, error: "No readable files for refactor" };
  }

  const prompt = buildRefactorPrompt({
    kind: request.kind,
    symbol: request.symbol,
    selection: request.selection,
    instruction: request.instruction,
    fileSnippets: snippets,
  });

  const completed = await input.complete({
    messages: [
      {
        role: "system",
        content:
          "You propose minimal multi-file refactors as JSON only. Never write to disk. Never include secrets.",
      },
      { role: "user", content: prompt },
    ],
    signal: input.signal,
    maxTokens: 2500,
    jsonMode: true,
  });

  if (!completed.ok) {
    return { success: false, error: completed.error || "Model call failed" };
  }

  return parseRefactorAiResponse(sanitizeIdeText(completed.text));
}
