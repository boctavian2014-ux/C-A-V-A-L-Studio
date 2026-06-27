import { describe, expect, it } from "vitest";
import { extractReasoningFromDelta } from "../../ai/providers/stream-reasoning";

describe("extractReasoningFromDelta", () => {
  it("reads reasoning field", () => {
    expect(extractReasoningFromDelta({ reasoning: "Step 1" })).toBe("Step 1");
  });

  it("reads reasoning_content alias", () => {
    expect(extractReasoningFromDelta({ reasoning_content: "Chain" })).toBe("Chain");
  });

  it("reads reasoning_details text and summary", () => {
    expect(
      extractReasoningFromDelta({
        reasoning_details: [
          { type: "reasoning.text", text: "A" },
          { type: "reasoning.summary", summary: "B" },
        ],
      })
    ).toBe("AB");
  });

  it("returns empty for content-only delta", () => {
    expect(extractReasoningFromDelta({ content: "hello" })).toBe("");
  });
});
