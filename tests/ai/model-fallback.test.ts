import { describe, expect, it } from "vitest";

import { ModelFallbackPlanner } from "../../ai/model-fallback";
import type { ModelRequest } from "../../ai/types";

describe("ModelFallbackPlanner", () => {
  it("returns candidates for chat capability", () => {
    const planner = new ModelFallbackPlanner();
    const request: ModelRequest = {
      prompt: "hello",
      capability: "chat",
      intent: "fallback",
    };
    const result = planner.candidatesFor(request);
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates.every((c) => c.capabilities.includes("chat"))).toBe(true);
  });

  it("excludes failed models from retry set", () => {
    const planner = new ModelFallbackPlanner();
    const request: ModelRequest = {
      prompt: "plan",
      capability: "planning",
      intent: "planning",
    };
    const first = planner.candidatesFor(request, ["qwen2.5-coder:7b"]);
    expect(first.candidates.some((c) => c.id === "qwen2.5-coder:7b")).toBe(false);
  });
});
