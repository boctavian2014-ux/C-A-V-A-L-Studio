import { describe, expect, it } from "vitest";
import { ModelScorer } from "../../ai/model-scorer";
import { modelProfiles } from "../../ai/model-profiles";
import type { ModelRequest } from "../../ai/types";

describe("ModelScorer", () => {
  const scorer = new ModelScorer();
  const poolside = modelProfiles.find((p) => p.id === "poolside-laguna-m-1")!;

  it("scores planning requests higher for planning-capable models", () => {
    const request: ModelRequest = {
      prompt: "Plan a refactor",
      capability: "planning",
      intent: "planning"
    };
    const breakdown = scorer.score(poolside, request);
    expect(breakdown.finalScore).toBeGreaterThan(50);
    expect(breakdown.reasons.some((r) => r.includes("task="))).toBe(true);
  });

  it("returns zero task score when capability missing", () => {
    const request: ModelRequest = {
      prompt: "x",
      capability: "embeddings"
    };
    const north = modelProfiles.find((p) => p.id === "north-mini-code")!;
    const breakdown = scorer.score(north, request);
    expect(breakdown.taskScore).toBe(0);
  });

  it("penalizes context overflow", () => {
    const request: ModelRequest = {
      prompt: "x".repeat(200_000),
      capability: "chat"
    };
    const north = modelProfiles.find((p) => p.id === "north-mini-code")!;
    const breakdown = scorer.score(north, request);
    expect(breakdown.contextScore).toBe(0);
  });
});
