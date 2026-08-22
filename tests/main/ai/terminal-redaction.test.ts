import { describe, expect, it } from "vitest";

import {
  detectRecentTerminalError,
  isTerminalAiPaletteEnabled,
  TERMINAL_AI_PALETTE,
  TERMINAL_EXPLAIN_MAX_RESPONSE_BYTES,
  TERMINAL_EXPLAIN_MAX_SCROLLBACK_BYTES,
  TERMINAL_EXPLAIN_MAX_SELECTION_BYTES,
  utf8ByteLength,
} from "../../../src/shared/ai-terminal-contract";
import {
  redactTerminalContent,
  TerminalContentTooLargeError,
} from "../../../src/main/ai/terminal-redaction";

describe("7c.3 terminal-redaction", () => {
  it("rejects selection over cap", () => {
    expect(() =>
      redactTerminalContent("x".repeat(TERMINAL_EXPLAIN_MAX_SELECTION_BYTES + 16), {
        context: "selection",
        maxBytes: TERMINAL_EXPLAIN_MAX_SELECTION_BYTES,
      })
    ).toThrow(TerminalContentTooLargeError);
  });

  it("rejects command over cap", () => {
    expect(() =>
      redactTerminalContent("y".repeat(500), {
        context: "command",
        maxBytes: 400,
      })
    ).toThrow(TerminalContentTooLargeError);
  });

  it("truncates scrollback over cap with [TRUNCATED]", () => {
    const out = redactTerminalContent("z".repeat(TERMINAL_EXPLAIN_MAX_SCROLLBACK_BYTES + 64), {
      context: "scrollback",
      maxBytes: TERMINAL_EXPLAIN_MAX_SCROLLBACK_BYTES,
    });
    expect(out).toContain("[TRUNCATED]");
    expect(utf8ByteLength(out)).toBeLessThanOrEqual(TERMINAL_EXPLAIN_MAX_SCROLLBACK_BYTES);
  });

  it("truncates response over cap with [TRUNCATED]", () => {
    const out = redactTerminalContent("r".repeat(TERMINAL_EXPLAIN_MAX_RESPONSE_BYTES + 32), {
      context: "response",
      maxBytes: TERMINAL_EXPLAIN_MAX_RESPONSE_BYTES,
    });
    expect(out).toContain("[TRUNCATED]");
    expect(utf8ByteLength(out)).toBeLessThanOrEqual(TERMINAL_EXPLAIN_MAX_RESPONSE_BYTES);
  });

  it("redacts secrets before size policy", () => {
    const out = redactTerminalContent(
      "fail sk-or-v1-abcdefghijklmnopqrstuvwxyz012345 npm ERR!",
      { context: "scrollback", maxBytes: TERMINAL_EXPLAIN_MAX_SCROLLBACK_BYTES }
    );
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("abcdefghijklmnopqrstuvwxyz012345");
  });
});

describe("7c.3 terminal AI palette enablement", () => {
  it("disables Suggest without recent error; enables with", () => {
    const suggest = TERMINAL_AI_PALETTE.find((e) => e.id === "suggest-fix")!;
    expect(
      isTerminalAiPaletteEnabled(suggest, { hasSelection: false, hasRecentError: false })
    ).toBe(false);
    expect(
      isTerminalAiPaletteEnabled(suggest, { hasSelection: false, hasRecentError: true })
    ).toBe(true);
  });

  it("disables Explain without selection; enables with", () => {
    const explain = TERMINAL_AI_PALETTE.find((e) => e.id === "explain")!;
    expect(
      isTerminalAiPaletteEnabled(explain, { hasSelection: false, hasRecentError: true })
    ).toBe(false);
    expect(
      isTerminalAiPaletteEnabled(explain, { hasSelection: true, hasRecentError: false })
    ).toBe(true);
  });

  it("detects recent terminal errors", () => {
    expect(detectRecentTerminalError("npm ERR! code ELIFECYCLE")).toBe(true);
    expect(detectRecentTerminalError("all green")).toBe(false);
  });
});
