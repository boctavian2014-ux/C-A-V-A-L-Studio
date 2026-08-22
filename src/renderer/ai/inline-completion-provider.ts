/**
 * Pure helpers for the Monaco inline-completion provider (Pas 6.2).
 * Ghost text only — nothing is written until explicit Tab accept.
 */

import {
  buildInlineCompletionPrefix,
  debounceUnlessCancelled,
  INLINE_COMPLETION_DEBOUNCE_MS,
  sanitizeInlineSuggestion,
  shouldBlockInlineCompletionPath,
  type InlineCompletionContextWindow,
} from "../../shared/ai-inline-completion-contract";

export type InlineCompletionFetch = (input: {
  prefix: string;
  filePath: string;
  language: string;
}) => Promise<{ ok?: boolean; suggestion?: string } | null | undefined>;

export interface ProvideInlineCompletionInput {
  fullText: string;
  lineNumber: number;
  column: number;
  filePath: string;
  language: string;
  token: {
    isCancellationRequested: boolean;
    onCancellationRequested?: (listener: () => void) => { dispose: () => void };
  };
  fetch: InlineCompletionFetch;
  debounceMs?: number;
}

export interface ProvideInlineCompletionResult {
  suggestion: string | null;
  context: InlineCompletionContextWindow;
  skippedReason?: "cancelled" | "sensitive" | "empty" | "rejected";
}

/**
 * Debounced, cancellable propose path. Does not mutate any model —
 * caller inserts only on explicit accept (Tab).
 */
export async function provideGatedInlineCompletion(
  input: ProvideInlineCompletionInput
): Promise<ProvideInlineCompletionResult> {
  const context = buildInlineCompletionPrefix({
    fullText: input.fullText,
    lineNumber: input.lineNumber,
    column: input.column,
  });

  if (shouldBlockInlineCompletionPath(input.filePath)) {
    return { suggestion: null, context, skippedReason: "sensitive" };
  }

  const proceeded = await debounceUnlessCancelled(
    input.debounceMs ?? INLINE_COMPLETION_DEBOUNCE_MS,
    input.token
  );
  if (!proceeded || input.token.isCancellationRequested) {
    return { suggestion: null, context, skippedReason: "cancelled" };
  }

  const result = await input.fetch({
    prefix: context.prefix,
    filePath: input.filePath,
    language: input.language,
  });

  if (input.token.isCancellationRequested) {
    return { suggestion: null, context, skippedReason: "cancelled" };
  }

  const suggestion = sanitizeInlineSuggestion(result?.suggestion);
  if (!suggestion) {
    return {
      suggestion: null,
      context,
      skippedReason: result?.suggestion ? "rejected" : "empty",
    };
  }

  return { suggestion, context };
}

/** Apply suggestion at cursor in a plain string model (tests / preview). */
export function applyInlineSuggestionAtCursor(
  source: string,
  lineNumber: number,
  column: number,
  suggestion: string
): string {
  const lines = source.split("\n");
  const idx = Math.max(0, Math.min(lineNumber - 1, lines.length - 1));
  const line = lines[idx] ?? "";
  const col = Math.max(1, Math.min(column, line.length + 1));
  const inserted = suggestion.split("\n");
  if (inserted.length === 1) {
    lines[idx] = line.slice(0, col - 1) + inserted[0] + line.slice(col - 1);
  } else {
    const first = line.slice(0, col - 1) + inserted[0];
    const last = inserted[inserted.length - 1]! + line.slice(col - 1);
    const middle = inserted.slice(1, -1);
    lines.splice(idx, 1, first, ...middle, last);
  }
  return lines.join("\n");
}
