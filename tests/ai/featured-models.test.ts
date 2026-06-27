import { describe, expect, it } from "vitest";
import {
  sortFeaturedFree,
  sortFeaturedPaid,
  FEATURED_BYOK_IDS,
} from "../../ai/models/featured-models";
import type { CatalogEntry } from "../../ai/models/model-catalog";

function entry(id: string, source: CatalogEntry["source"] = "openrouter"): CatalogEntry {
  return {
    id,
    label: id,
    source,
    provider: source === "byok" ? "byok" : "openrouter",
    tier: "paid",
    contextWindow: 128_000,
    color: "#00E0FF",
  };
}

describe("featured-models", () => {
  it("sortFeaturedFree prioritizes known free patterns before others", () => {
    const sorted = sortFeaturedFree([
      entry("openrouter:other/model:free"),
      entry("openrouter:deepseek/deepseek-chat:free"),
      entry("openrouter:meta-llama/llama-3.3-70b-instruct:free"),
    ]);
    expect(sorted[0].id).not.toContain("other");
    expect(sorted[sorted.length - 1].id).toContain("other");
  });

  it("sortFeaturedPaid puts BYOK featured models first", () => {
    const byokId = FEATURED_BYOK_IDS[0];
    const sorted = sortFeaturedPaid(
      [
        entry("openrouter:anthropic/claude-sonnet-4"),
        entry(byokId, "byok"),
        entry("openrouter:random/model"),
      ],
      new Set()
    );
    expect(sorted[0].id).toBe(byokId);
  });

  it("excludes codingIds from paid sort tail", () => {
    const coding = new Set(["qwen2.5-coder:7b"]);
    const sorted = sortFeaturedPaid(
      [entry("qwen2.5-coder:7b", "byok"), entry("gpt-4o", "byok")],
      coding
    );
    expect(sorted.some((e) => e.id === "qwen2.5-coder:7b")).toBe(false);
    expect(sorted[0].id).toBe("gpt-4o");
  });
});
