import { describe, expect, it } from "vitest";
import { ModelRouter } from "../../ai/model-router";
import type { ModelRequest } from "../../ai/types";

describe("ModelRouter", () => {
  const router = new ModelRouter([], { fallbackEnabled: true });

  it("lists models filtered by capability", () => {
    const models = router.listModels("chat");
    expect(models.every((m) => m.capabilities.includes("chat"))).toBe(true);
  });

  it("ranks planning-capable models for planning intent", () => {
    const request: ModelRequest = {
      prompt: "Create release plan",
      capability: "planning",
      intent: "planning"
    };
    const ranked = router.rank(request);
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked[0].score).toBeGreaterThan(0);
    expect(ranked[0].model.capabilities).toContain("planning");
  });

  it("selects highest ranked model with reason", () => {
    const request: ModelRequest = {
      prompt: "Fix bug",
      capability: "chat",
      intent: "debug"
    };
    const selection = router.select(request);
    expect(selection.model).toBeTruthy();
    expect(selection.reason).toBeTruthy();
    expect(selection.score).toBeGreaterThan(0);
  });
});
