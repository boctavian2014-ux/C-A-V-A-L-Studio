import { describe, expect, it } from "vitest";

import {
  isTranscriptVisibleKind,
  transcriptTextFromStreamChunk,
} from "../../src/shared/chat-stream-visibility";
import { buildLiteSystemPrompt } from "../../ai/context-engine/context-builder";
import { MULTI_MODEL_RECAP_ADDON } from "../../ai/prompts/multi-model-reasoning-chat";

describe("chat stream fail-closed visibility", () => {
  it("only assistant_message is visible in the transcript", () => {
    expect(isTranscriptVisibleKind("assistant_message")).toBe(true);
    expect(isTranscriptVisibleKind("tool_result")).toBe(false);
    expect(isTranscriptVisibleKind("internal_prompt")).toBe(false);
    expect(isTranscriptVisibleKind("reasoning")).toBe(false);
    expect(isTranscriptVisibleKind("recap")).toBe(false);
    expect(isTranscriptVisibleKind("agent_progress")).toBe(false);
    expect(isTranscriptVisibleKind(undefined)).toBe(false);
    expect(isTranscriptVisibleKind("APPLY_EDIT")).toBe(false);
  });

  it("drops unclassified deltas, recap JSON, and tool output from transcript text", () => {
    expect(
      transcriptTextFromStreamChunk({
        type: "delta",
        delta: "Hello from the assistant.",
        kind: "assistant_message",
      })
    ).toBe("Hello from the assistant.");

    expect(
      transcriptTextFromStreamChunk({
        type: "delta",
        delta: "Understood: x\nDone: y\nNext: z",
        kind: "recap",
      })
    ).toBe("");

    expect(
      transcriptTextFromStreamChunk({
        type: "delta",
        delta: '{"taskCount":3}',
        kind: "recap",
      })
    ).toBe("");

    expect(
      transcriptTextFromStreamChunk({
        type: "delta",
        delta: "🔧 *write_file*…",
        kind: "tool_result",
      })
    ).toBe("");

    expect(
      transcriptTextFromStreamChunk({
        type: "delta",
        delta: "unclassified leak",
      })
    ).toBe("");
  });

  it("does not append MULTI_MODEL_RECAP_ADDON to stream system prompts", () => {
    const lite = buildLiteSystemPrompt("ask");
    expect(lite).not.toContain("Understood:");
    expect(lite).not.toContain(MULTI_MODEL_RECAP_ADDON.trim());
  });
});
