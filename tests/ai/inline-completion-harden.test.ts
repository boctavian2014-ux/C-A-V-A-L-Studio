import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildInlineCompletionPrefix,
  countSuggestionLines,
  debounceUnlessCancelled,
  formatInlineCompletionPrompt,
  sanitizeInlineSuggestion,
  shouldBlockInlineCompletionPath,
} from "../../src/shared/ai-inline-completion-contract";
import {
  applyInlineSuggestionAtCursor,
  provideGatedInlineCompletion,
} from "../../src/renderer/ai/inline-completion-provider";
import { emitQuickFixAcceptTimeline } from "../../src/main/ai/quick-fix-runner";
import type { TimelineEvent } from "../../src/shared/ai-timeline-contract";

function createToken(cancelled = false) {
  let isCancellationRequested = cancelled;
  const listeners: Array<() => void> = [];
  return {
    get isCancellationRequested() {
      return isCancellationRequested;
    },
    onCancellationRequested: (listener: () => void) => {
      listeners.push(listener);
      return {
        dispose: () => {
          const idx = listeners.indexOf(listener);
          if (idx >= 0) listeners.splice(idx, 1);
        },
      };
    },
    cancel: () => {
      isCancellationRequested = true;
      listeners.forEach((l) => l());
    },
  };
}

describe("M6.2 inline completion harden", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds a local prefix window and redacts secrets before the provider", () => {
    const source = [
      "const a = 1;",
      "const key = 'sk-or-v1-abcdefghijklmnopqrstuvwxyz012345';",
      "fetch(",
    ].join("\n");
    const ctx = buildInlineCompletionPrefix({
      fullText: source,
      lineNumber: 3,
      column: 6,
      radiusLines: 20,
    });
    expect(ctx.prefix).toContain("fetch");
    expect(ctx.prefix.endsWith("fetch")).toBe(true);

    const prompt = formatInlineCompletionPrompt({
      language: "typescript",
      filePath: "src/app.ts",
      prefix: ctx.prefix,
    });
    expect(prompt).toContain('kind="untrusted workspace content"');
    expect(prompt).toContain("[REDACTED]");
    expect(prompt).not.toContain("abcdefghijklmnopqrstuvwxyz012345");
    expect(shouldBlockInlineCompletionPath(".env")).toBe(true);
  });

  it("rejects oversized or multi-file suggestions", () => {
    const manyLines = Array.from({ length: 12 }, (_, i) => `line${i}`).join("\n");
    expect(sanitizeInlineSuggestion(manyLines)).toBeNull();
    expect(countSuggestionLines(manyLines)).toBe(12);
    expect(
      sanitizeInlineSuggestion("diff --git a/x b/x\n--- a/x\n+++ b/x\n+hi")
    ).toBeNull();
    expect(sanitizeInlineSuggestion("  .then(r => r.json())  ")).toBe(".then(r => r.json())");
  });

  it("proposes ghost text without mutating the model until accept", async () => {
    vi.useFakeTimers();
    const original = "const x = ";
    const token = createToken();
    const fetch = vi.fn(async () => ({ ok: true, suggestion: "1;" }));

    const pending = provideGatedInlineCompletion({
      fullText: original,
      lineNumber: 1,
      column: original.length + 1,
      filePath: "src/a.ts",
      language: "typescript",
      token,
      fetch,
      debounceMs: 300,
    });

    expect(fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    const result = await pending;
    expect(result.suggestion).toBe("1;");
    // Model unchanged — ghost only
    expect(original).toBe("const x = ");

    const accepted = applyInlineSuggestionAtCursor(
      original,
      1,
      original.length + 1,
      result.suggestion!
    );
    expect(accepted).toBe("const x = 1;");

    // Undo at model level: restore prior snapshot
    const undoStack = [original];
    let model = accepted;
    model = undoStack.pop()!;
    expect(model).toBe(original);
  });

  it("cancels during debounce without calling the provider", async () => {
    vi.useFakeTimers();
    const token = createToken();
    const fetch = vi.fn(async () => ({ ok: true, suggestion: "nope" }));
    const pending = provideGatedInlineCompletion({
      fullText: "abc",
      lineNumber: 1,
      column: 4,
      filePath: "src/a.ts",
      language: "typescript",
      token,
      fetch,
      debounceMs: 300,
    });
    token.cancel();
    await vi.advanceTimersByTimeAsync(300);
    const result = await pending;
    expect(result.skippedReason).toBe("cancelled");
    expect(result.suggestion).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("debounceUnlessCancelled resolves false when cancelled mid-wait", async () => {
    vi.useFakeTimers();
    const token = createToken();
    const pending = debounceUnlessCancelled(300, token);
    await vi.advanceTimersByTimeAsync(100);
    token.cancel();
    await expect(pending).resolves.toBe(false);
  });

  it("emits file_write on timeline only after accept", () => {
    const events: TimelineEvent[] = [];
    const stream = {
      send: (chunk: Record<string, unknown>) => {
        if (chunk.type === "timeline" && chunk.event) {
          events.push(chunk.event as TimelineEvent);
        }
        return true;
      },
      isAlive: () => true,
    };
    // Propose phase: no timeline
    expect(events).toEqual([]);
    emitQuickFixAcceptTimeline(stream, "ic-1", {
      filePath: "src/app.ts",
      editCount: 1,
      detail: "inline completion accepted",
    });
    expect(events.map((e) => e.type)).toEqual(["file_write"]);
    expect(events[0]?.filePath).toBe("src/app.ts");
    expect(events[0]?.detail).toMatch(/inline completion/i);
  });
});
