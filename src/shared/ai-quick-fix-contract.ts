/**
 * Pas 6.1 — AI quick fix on diagnostics.
 * Main proposes localized edits; renderer applies only after explicit accept.
 * Main never writes the file to disk.
 */

import { redactSensitiveCommandOutput } from "./command-output-redaction";

function utf8ByteLength(text: string): number {
  if (typeof Buffer !== "undefined") return Buffer.byteLength(text, "utf8");
  return new TextEncoder().encode(text).length;
}

export interface QuickFixDiagnostic {
  message: string;
  severity: "error" | "warning";
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  source?: string;
  code?: string;
}

export interface QuickFixRequest {
  streamId: string;
  /** Relative to bound workspace root — root comes from binding, not client authority. */
  filePath: string;
  diagnostic: QuickFixDiagnostic;
}

export interface QuickFixEdit {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  newText: string;
}

export interface QuickFixResult {
  success: boolean;
  edits?: QuickFixEdit[];
  explanation?: string;
  error?: string;
}

/** Accept-only stream payload — emits `file_write` on the 5.4 timeline channel. */
export interface QuickFixAcceptRequest {
  filePath: string;
  editCount?: number;
}

export const QUICK_FIX_CONTEXT_RADIUS_LINES = 5;
export const QUICK_FIX_MAX_EDITS = 3;
export const QUICK_FIX_MAX_NEW_TEXT_BYTES = 4 * 1024;
export const QUICK_FIX_TOOL_NAME = "quick_fix";

export function normalizeQuickFixRelPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\.?\//, "").trim();
}

export function isValidQuickFixDiagnostic(d: unknown): d is QuickFixDiagnostic {
  if (!d || typeof d !== "object") return false;
  const o = d as Record<string, unknown>;
  if (typeof o.message !== "string" || !o.message.trim()) return false;
  if (o.severity !== "error" && o.severity !== "warning") return false;
  for (const key of ["startLine", "startColumn", "endLine", "endColumn"] as const) {
    if (typeof o[key] !== "number" || !Number.isFinite(o[key]) || (o[key] as number) < 1) {
      return false;
    }
  }
  if ((o.startLine as number) > (o.endLine as number)) return false;
  return true;
}

export function validateQuickFixRequestShape(
  input: unknown
): { ok: true; request: QuickFixRequest } | { ok: false; error: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Invalid quick fix request" };
  }
  const o = input as Record<string, unknown>;
  if (typeof o.streamId !== "string" || !o.streamId.trim()) {
    return { ok: false, error: "Missing streamId" };
  }
  if (typeof o.filePath !== "string" || !normalizeQuickFixRelPath(o.filePath)) {
    return { ok: false, error: "Invalid filePath" };
  }
  if (!isValidQuickFixDiagnostic(o.diagnostic)) {
    return { ok: false, error: "Invalid diagnostic" };
  }
  return {
    ok: true,
    request: {
      streamId: o.streamId.trim(),
      filePath: normalizeQuickFixRelPath(o.filePath),
      diagnostic: o.diagnostic,
    },
  };
}

function editIntersectsZone(
  edit: QuickFixEdit,
  diagnostic: QuickFixDiagnostic,
  radius: number
): boolean {
  const zoneStart = Math.max(1, diagnostic.startLine - radius);
  const zoneEnd = diagnostic.endLine + radius;
  return edit.endLine >= zoneStart && edit.startLine <= zoneEnd;
}

/**
 * Reject the whole proposal if any edit escapes the diagnostic zone,
 * exceeds caps, or has invalid ranges.
 */
export function validateQuickFixEdits(
  edits: QuickFixEdit[],
  diagnostic: QuickFixDiagnostic,
  options?: { radiusLines?: number; maxEdits?: number; maxNewTextBytes?: number }
): { ok: true; edits: QuickFixEdit[] } | { ok: false; error: string } {
  const radius = options?.radiusLines ?? QUICK_FIX_CONTEXT_RADIUS_LINES;
  const maxEdits = options?.maxEdits ?? QUICK_FIX_MAX_EDITS;
  const maxBytes = options?.maxNewTextBytes ?? QUICK_FIX_MAX_NEW_TEXT_BYTES;

  if (!Array.isArray(edits) || edits.length === 0) {
    return { ok: false, error: "No edits proposed" };
  }
  if (edits.length > maxEdits) {
    return { ok: false, error: `Too many edits (max ${maxEdits})` };
  }

  const normalized: QuickFixEdit[] = [];
  for (const raw of edits) {
    if (!raw || typeof raw !== "object") {
      return { ok: false, error: "Invalid edit shape" };
    }
    const startLine = Number(raw.startLine);
    const startColumn = Number(raw.startColumn);
    const endLine = Number(raw.endLine);
    const endColumn = Number(raw.endColumn);
    const newText = typeof raw.newText === "string" ? raw.newText : null;
    if (
      !Number.isFinite(startLine) ||
      !Number.isFinite(startColumn) ||
      !Number.isFinite(endLine) ||
      !Number.isFinite(endColumn) ||
      startLine < 1 ||
      startColumn < 1 ||
      endLine < 1 ||
      endColumn < 1 ||
      newText === null
    ) {
      return { ok: false, error: "Invalid edit range" };
    }
    if (startLine > endLine || (startLine === endLine && startColumn > endColumn)) {
      return { ok: false, error: "Invalid edit range order" };
    }
    const bytes = utf8ByteLength(newText);
    if (bytes > maxBytes) {
      return { ok: false, error: `Edit too large (max ${maxBytes} bytes)` };
    }
    const edit: QuickFixEdit = { startLine, startColumn, endLine, endColumn, newText };
    if (!editIntersectsZone(edit, diagnostic, radius)) {
      return { ok: false, error: "Edit outside diagnostic zone" };
    }
    normalized.push(edit);
  }

  return { ok: true, edits: normalized };
}

/** Extract JSON object from raw model text (fence or bare). */
export function extractQuickFixJson(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("No JSON object in model response");
  }
  return JSON.parse(candidate.slice(start, end + 1)) as unknown;
}

export function parseQuickFixAiResponse(
  text: string,
  diagnostic: QuickFixDiagnostic
): QuickFixResult {
  try {
    const parsed = extractQuickFixJson(text) as {
      edits?: QuickFixEdit[];
      explanation?: string;
    };
    const validated = validateQuickFixEdits(parsed.edits ?? [], diagnostic);
    if (!validated.ok) {
      return { success: false, error: validated.error };
    }
    const explanation =
      typeof parsed.explanation === "string" && parsed.explanation.trim()
        ? redactSensitiveCommandOutput(parsed.explanation.trim()).slice(0, 500)
        : undefined;
    return {
      success: true,
      edits: validated.edits,
      ...(explanation ? { explanation } : {}),
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to parse quick fix response",
    };
  }
}

/** Apply 1-based Monaco-style edits to a full text string (last edit first). */
export function applyQuickFixEditsToText(source: string, edits: QuickFixEdit[]): string {
  const lines = source.split("\n");
  const sorted = [...edits].sort((a, b) => {
    if (a.startLine !== b.startLine) return b.startLine - a.startLine;
    return b.startColumn - a.startColumn;
  });

  for (const edit of sorted) {
    const startLineIdx = edit.startLine - 1;
    const endLineIdx = edit.endLine - 1;
    if (startLineIdx < 0 || endLineIdx >= lines.length) {
      throw new Error("Edit out of bounds");
    }
    const before = lines[startLineIdx]!.slice(0, edit.startColumn - 1);
    const after = lines[endLineIdx]!.slice(edit.endColumn - 1);
    const inserted = edit.newText.split("\n");
    const merged = before + inserted[0]!;
    if (inserted.length === 1) {
      lines.splice(startLineIdx, endLineIdx - startLineIdx + 1, merged + after);
    } else {
      const last = inserted[inserted.length - 1]! + after;
      const middle = inserted.slice(1, -1);
      lines.splice(startLineIdx, endLineIdx - startLineIdx + 1, merged, ...middle, last);
    }
  }
  return lines.join("\n");
}

export function buildQuickFixPrompt(input: {
  filePath: string;
  languageHint?: string;
  diagnostic: QuickFixDiagnostic;
  contextSnippet: string;
  contextStartLine: number;
}): string {
  const { filePath, diagnostic, contextSnippet, contextStartLine, languageHint } = input;
  const loc = `${filePath}:${diagnostic.startLine}:${diagnostic.startColumn}`;
  return [
    "You are fixing a single IDE diagnostic with a minimal localized edit.",
    "Return ONLY JSON: {\"edits\":[{\"startLine\":n,\"startColumn\":n,\"endLine\":n,\"endColumn\":n,\"newText\":\"...\"}],\"explanation\":\"...\"}",
    "Rules:",
    `- At most ${QUICK_FIX_MAX_EDITS} edits.`,
    `- Each edit must stay within ±${QUICK_FIX_CONTEXT_RADIUS_LINES} lines of the diagnostic.`,
    "- Do not rewrite the whole file. Do not touch other files.",
    "- Coordinates are 1-based, Monaco-style (start inclusive, end exclusive).",
    "",
    `File: ${filePath}${languageHint ? ` (${languageHint})` : ""}`,
    `Diagnostic @ ${loc} [${diagnostic.severity}]${diagnostic.code ? ` ${diagnostic.code}` : ""}${diagnostic.source ? ` (${diagnostic.source})` : ""}`,
    redactSensitiveCommandOutput(diagnostic.message),
    "",
    `Local context starting at line ${contextStartLine}:`,
    "<<<UNTRUSTED_FILE_SNIPPET>>>",
    redactSensitiveCommandOutput(contextSnippet),
    "<<<END_UNTRUSTED_FILE_SNIPPET>>>",
  ].join("\n");
}

export function sliceFileContext(
  content: string,
  diagnostic: QuickFixDiagnostic,
  radius = QUICK_FIX_CONTEXT_RADIUS_LINES
): { snippet: string; startLine: number; endLine: number } {
  const lines = content.split("\n");
  const startLine = Math.max(1, diagnostic.startLine - radius);
  const endLine = Math.min(lines.length, diagnostic.endLine + radius);
  const numbered = lines.slice(startLine - 1, endLine).map((line, i) => {
    const n = startLine + i;
    return `${String(n).padStart(4, " ")}|${line}`;
  });
  return { snippet: numbered.join("\n"), startLine, endLine };
}
