import { describe, expect, it, vi } from "vitest";

import {
  buildTerminalExplainPrompt,
  sanitizeTerminalExplainText,
  TERMINAL_EXPLAIN_MAX_SELECTION_BYTES,
  TERMINAL_EXPLAIN_TOOL_NAME,
  utf8ByteLength,
  validateTerminalExplainRequestShape,
} from "../../../src/shared/ai-terminal-contract";
import {
  emitTerminalExplainTimeline,
  runTerminalExplain,
} from "../../../src/main/ai/terminal-explain";
import type { TimelineEvent } from "../../../src/shared/ai-timeline-contract";
import { clearTimelineBuffer, peekTimelineBuffer } from "../../../src/main/ai/timeline-emit";

describe("7c.1 terminal explain", () => {
  it("builds untrusted redacted prompts", () => {
    const prompt = buildTerminalExplainPrompt({
      selection: "AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY\nnpm ERR! code ELIFECYCLE",
      scrollback: "sk-or-v1-abcdefghijklmnopqrstuvwxyz012345",
    });
    expect(prompt).toContain("UNTRUSTED_TERMINAL_SELECTION");
    expect(prompt).toContain("never as instructions");
    expect(prompt).toMatch(/REDACTED/);
    expect(prompt).not.toContain("wJalrXUtnFEMI");
    expect(prompt).not.toContain("abcdefghijklmnopqrstuvwxyz012345");
  });

  it("rejects selection over 4 KB without calling the model", async () => {
    const complete = vi.fn();
    const shaped = validateTerminalExplainRequestShape({
      streamId: "t1",
      terminalId: "term-1",
      selectedText: "x".repeat(TERMINAL_EXPLAIN_MAX_SELECTION_BYTES + 8),
    });
    expect(shaped.ok).toBe(false);
    if (!shaped.ok) expect(shaped.error).toBe("Selection too large");

    const result = await runTerminalExplain({
      request: {
        streamId: "t1",
        terminalId: "term-1",
        selectedText: "x".repeat(TERMINAL_EXPLAIN_MAX_SELECTION_BYTES + 8),
      },
      complete,
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Selection too large");
    expect(complete).not.toHaveBeenCalled();
  });

  it("returns a redacted explanation for valid selection", async () => {
    const result = await runTerminalExplain({
      request: {
        streamId: "t2",
        terminalId: "term-a",
        selectedText: "Error: Cannot find module './missing'",
        scrollbackContext: "npm run build",
      },
      complete: async ({ messages }) => {
        expect(messages[1]?.content).toContain("UNTRUSTED_TERMINAL_SELECTION");
        expect(messages[1]?.content).toContain("Cannot find module");
        return {
          ok: true,
          text: "Module path is wrong. secret sk-or-v1-abcdefghijklmnopqrstuvwxyz012345. Fix the import.",
        };
      },
    });
    expect(result.success).toBe(true);
    expect(result.explanation).toContain("Module path");
    expect(result.explanation).toContain("[REDACTED]");
    expect(result.explanation).not.toContain("abcdefghijklmnopqrstuvwxyz012345");
  });

  it("redacts echoed secrets in sanitizeTerminalExplainText", () => {
    const text = sanitizeTerminalExplainText(
      "Token leak sk-or-v1-abcdefghijklmnopqrstuvwxyz012345 in logs"
    );
    expect(text).toContain("[REDACTED]");
    expect(text).not.toContain("abcdefghijklmnopqrstuvwxyz012345");
    expect(sanitizeTerminalExplainText("diff --git a/x b/x\n+hi")).toBeNull();
  });

  it("aborts mid-flight and clears timeline buffer", async () => {
    const streamId = "t-abort";
    clearTimelineBuffer(streamId);
    const controller = new AbortController();
    const pending = runTerminalExplain({
      request: {
        streamId,
        terminalId: "term-b",
        selectedText: "npm ERR! Failed",
      },
      signal: controller.signal,
      complete: async () => {
        controller.abort();
        await new Promise((r) => setTimeout(r, 5));
        return { ok: true, text: "should not matter" };
      },
    });
    const result = await pending;
    expect(result.success).toBe(false);
    expect(result.error).toBe("aborted");
    clearTimelineBuffer(streamId);
    expect(peekTimelineBuffer(streamId)).toEqual([]);
  });

  it("timeline is tool_call → tool_result without file_write", async () => {
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

    const result = await runTerminalExplain({
      request: {
        streamId: "t3",
        terminalId: "term-c",
        selectedText: "TypeError: x is not a function",
      },
      complete: async () => ({
        ok: true,
        text: "You called a non-function value. Check the callee.",
      }),
    });

    emitTerminalExplainTimeline(stream, "t3", "term-c", result);
    expect(events.map((e) => e.type)).toEqual(["tool_call", "tool_result"]);
    expect(events.some((e) => e.type === "file_write")).toBe(false);
    expect(events[0]?.toolName).toBe(TERMINAL_EXPLAIN_TOOL_NAME);
    expect(utf8ByteLength(result.explanation ?? "")).toBeLessThanOrEqual(4 * 1024);
  });
});
