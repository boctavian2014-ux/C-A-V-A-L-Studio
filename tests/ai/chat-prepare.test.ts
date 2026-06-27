import { describe, expect, it } from "vitest";
import { hashChatDraft } from "../../ai/composer/chat-prepare";

describe("chat-prepare", () => {
  it("hashChatDraft is stable for same inputs", () => {
    const a = hashChatDraft("hello", "caval-auto/balanced", "/proj");
    const b = hashChatDraft("hello", "caval-auto/balanced", "/proj");
    expect(a).toBe(b);
    expect(a.startsWith("d")).toBe(true);
  });

  it("hashChatDraft changes when draft or model changes", () => {
    const base = hashChatDraft("hello", "caval-auto/balanced", "/proj");
    expect(hashChatDraft("hello!", "caval-auto/balanced", "/proj")).not.toBe(base);
    expect(hashChatDraft("hello", "caval-auto/frontier", "/proj")).not.toBe(base);
    expect(hashChatDraft("hello", "caval-auto/balanced", null)).not.toBe(base);
  });

  it("trims whitespace in draft before hashing", () => {
    expect(hashChatDraft("  hi  ", "m", null)).toBe(hashChatDraft("hi", "m", null));
  });
});
