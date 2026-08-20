import { afterEach, describe, expect, it } from "vitest";

import {
  clipTimelineText,
  sanitizeTimelineEvent,
  summarizeToolDetail,
} from "../../src/shared/ai-timeline-contract";
import { emitTimelineEvent, resetTimelineBuffersForTests } from "../../src/main/ai/timeline-emit";
import { mergeUnifiedTimelineRows } from "../../ai/composer/ChatUnifiedTimeline";

describe("ai-timeline-contract", () => {
  it("sanitizes and bounds label/detail", () => {
    const event = sanitizeTimelineEvent({
      type: "tool_result",
      label: "x".repeat(400),
      detail: `token sk-or-v1-${"a".repeat(40)}`,
      toolName: "get_problems",
      success: true,
    });
    expect(event.label.length).toBeLessThanOrEqual(160);
    expect(event.detail).toContain("[REDACTED]");
    expect(event.detail).not.toContain("aaaaaaaa");
    expect(event.id).toBeTruthy();
    expect(event.timestamp).toBeGreaterThan(0);
  });

  it("summarizeToolDetail redacts secrets", () => {
    const detail = summarizeToolDetail(
      'Bearer sk-or-v1-abcdefghijklmnopqrstuvwxyz012345\nnext',
      false
    );
    expect(detail).toContain("[REDACTED]");
    expect(detail).not.toContain("abcdefghijklmnopqrstuvwxyz012345");
  });

  it("clipTimelineText truncates with ellipsis", () => {
    expect(clipTimelineText("hello world", 5)).toBe("hell…");
  });
});

describe("emitTimelineEvent", () => {
  afterEach(() => {
    resetTimelineBuffersForTests();
  });
  it("sends a timeline chunk on the existing stream channel", () => {
    const sent: Array<Record<string, unknown>> = [];
    const event = emitTimelineEvent(
      {
        send: (chunk) => {
          sent.push(chunk);
          return true;
        },
        isAlive: () => true,
      },
      "stream-1",
      {
        type: "tool_call",
        label: "Running get_problems",
        toolName: "get_problems",
      }
    );
    expect(event?.type).toBe("tool_call");
    expect(sent).toHaveLength(1);
    expect(sent[0]?.type).toBe("timeline");
    expect(sent[0]?.streamId).toBe("stream-1");
    expect((sent[0]?.event as { toolName?: string }).toolName).toBe("get_problems");
  });

  it("does not send when the stream is dead", () => {
    const sent: Array<Record<string, unknown>> = [];
    const event = emitTimelineEvent(
      {
        send: (chunk) => {
          sent.push(chunk);
          return true;
        },
        isAlive: () => false,
      },
      "stream-1",
      { type: "error", label: "failed" }
    );
    expect(event).toBeNull();
    expect(sent).toHaveLength(0);
  });
});

describe("tool_call before tool_result ordering", () => {
  afterEach(() => {
    resetTimelineBuffersForTests();
  });
  it("preserves emission order in the chunk list", () => {
    const sent: Array<Record<string, unknown>> = [];
    const stream = {
      send: (chunk: Record<string, unknown>) => {
        sent.push(chunk);
        return true;
      },
    };
    emitTimelineEvent(stream, "s", {
      type: "tool_call",
      label: "Running run_task",
      toolName: "run_task",
    });
    emitTimelineEvent(stream, "s", {
      type: "tool_result",
      label: "run_task succeeded",
      toolName: "run_task",
      success: true,
    });
    expect((sent[0]?.event as { type: string }).type).toBe("tool_call");
    expect((sent[1]?.event as { type: string }).type).toBe("tool_result");
  });
});

describe("mergeUnifiedTimelineRows", () => {
  it("merges stream events and multi-agent steps without mixing ids", () => {
    const rows = mergeUnifiedTimelineRows({
      timelineEvents: [
        {
          id: "tl-1",
          type: "tool_call",
          timestamp: 100,
          label: "Running get_problems",
          toolName: "get_problems",
        },
      ],
      multiAgentSteps: [
        {
          phase: "compose",
          status: "active",
          at: 50,
          stepId: "compose",
        },
      ],
    });
    expect(rows.map((r) => r.id)).toEqual(["ma-compose-50", "tl-1"]);
    expect(rows[0]?.type).toBe("reasoning");
  });
});
