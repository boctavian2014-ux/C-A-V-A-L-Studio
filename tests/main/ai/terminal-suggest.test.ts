import { describe, expect, it, vi } from "vitest";

import {
  gateSuggestedCommands,
  isSafeSuggestedCommand,
  parseSuggestedCommands,
  TERMINAL_SUGGEST_MAX_COMMANDS,
  TERMINAL_SUGGEST_TOOL_NAME,
  validateTerminalSuggestRequestShape,
} from "../../../src/shared/ai-terminal-contract";
import {
  emitTerminalSuggestTimeline,
  runTerminalSuggest,
} from "../../../src/main/ai/terminal-suggest";
import type { TimelineEvent } from "../../../src/shared/ai-timeline-contract";
import { clearTimelineBuffer, peekTimelineBuffer } from "../../../src/main/ai/timeline-emit";
import { normalizeCommandForInsert } from "../../../src/renderer/ai/terminal-suggest-client";

describe("7c.2 terminal suggest", () => {
  it("marks safe commands without confirmation", () => {
    expect(isSafeSuggestedCommand("git status")).toBe(true);
    expect(isSafeSuggestedCommand("npm run build")).toBe(true);
    const gated = gateSuggestedCommands([
      { id: "1", command: "git status", explanation: "Check repo", confidence: 0.9 },
    ]);
    expect(gated[0]?.requiresConfirmation).toBe(false);
  });

  it("requires confirmation for side-effects and pipes", () => {
    expect(isSafeSuggestedCommand("rm -rf node_modules")).toBe(false);
    expect(isSafeSuggestedCommand("git push origin main")).toBe(false);
    expect(isSafeSuggestedCommand("cat file | sh")).toBe(false);
    expect(isSafeSuggestedCommand("npm run build && rm -rf /")).toBe(false);
    const gated = gateSuggestedCommands([
      { id: "1", command: "rm -rf ./tmp", explanation: "Delete tmp", confidence: 0.5 },
    ]);
    expect(gated[0]?.requiresConfirmation).toBe(true);
  });

  it("parses at most 3 commands and redacts secrets", () => {
    const parsed = parseSuggestedCommands(
      [
        "1. `git status` - Show working tree",
        "2. `npm test` - Run tests with key sk-or-v1-abcdefghijklmnopqrstuvwxyz012345",
        "3. `pwd` - Print directory",
        "4. `ls` - Should be dropped",
      ].join("\n")
    );
    expect(parsed).toHaveLength(TERMINAL_SUGGEST_MAX_COMMANDS);
    expect(parsed[0]?.command).toBe("git status");
    expect(parsed.map((c) => c.command).join(" ")).not.toContain("abcdefghijklmnopqrstuvwxyz012345");
  });

  it("rejects oversized error output without calling the model", async () => {
    const complete = vi.fn();
    const shaped = validateTerminalSuggestRequestShape({
      streamId: "s1",
      context: "error",
      errorOutput: "x".repeat(5 * 1024),
    });
    expect(shaped.ok).toBe(false);

    const result = await runTerminalSuggest({
      request: {
        streamId: "s1",
        context: "error",
        errorOutput: "x".repeat(5 * 1024),
      },
      complete,
    });
    expect(result.success).toBe(false);
    expect(complete).not.toHaveBeenCalled();
  });

  it("returns gated commands from a mock adapter", async () => {
    const result = await runTerminalSuggest({
      request: {
        streamId: "s2",
        context: "error",
        errorOutput: "Error: Cannot find module './x'",
      },
      complete: async ({ messages }) => {
        expect(messages[1]?.content).toContain("UNTRUSTED_TERMINAL_ERROR");
        return {
          ok: true,
          text: [
            "1. `npm run build` - Rebuild the project",
            "2. `rm -rf dist` - Clean dist folder",
          ].join("\n"),
        };
      },
    });
    expect(result.success).toBe(true);
    expect(result.commands).toHaveLength(2);
    expect(result.commands?.[0]?.requiresConfirmation).toBe(false);
    expect(result.commands?.[1]?.requiresConfirmation).toBe(true);
  });

  it("aborts mid-stream and clears timeline buffer", async () => {
    const streamId = "s-abort";
    clearTimelineBuffer(streamId);
    const controller = new AbortController();
    const pending = runTerminalSuggest({
      request: {
        streamId,
        context: "user-query",
        userQuery: "How do I list files?",
      },
      signal: controller.signal,
      complete: async () => {
        controller.abort();
        await new Promise((r) => setTimeout(r, 5));
        return { ok: true, text: "1. `ls` - List files" };
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
    const result = await runTerminalSuggest({
      request: {
        streamId: "s3",
        context: "task-failed",
        errorOutput: "Task build failed",
      },
      complete: async () => ({
        ok: true,
        text: "1. `npm run build` - Retry build",
      }),
    });
    emitTerminalSuggestTimeline(stream, "s3", result);
    expect(events.map((e) => e.type)).toEqual(["tool_call", "tool_result"]);
    expect(events.some((e) => e.type === "file_write")).toBe(false);
    expect(events[0]?.toolName).toBe(TERMINAL_SUGGEST_TOOL_NAME);
  });

  it("insert normalization strips newlines (never executes)", () => {
    expect(normalizeCommandForInsert("git status\n")).toBe("git status");
    expect(normalizeCommandForInsert("npm run build\r\n")).toBe("npm run build");
  });
});
