import { describe, expect, it, vi } from "vitest";

import { ZeroLatencyCache } from "../../ai/composer/zero-latency/zl-cache";
import { ZLPreplanner } from "../../ai/composer/zero-latency/zl-preplanner";
import { ZLScheduler } from "../../ai/composer/zero-latency/zl-scheduler";

describe("ZeroLatencyCache", () => {
  it("merges warmed models on upsert", () => {
    const cache = new ZeroLatencyCache();
    cache.upsert({ workspaceRoot: "/p", objectiveDraft: "fix auth", warmedModels: ["model-a"] });
    const entry = cache.upsert({ workspaceRoot: "/p", objectiveDraft: "fix auth", warmedModels: ["model-b"] });
    expect(entry.warmedModels).toContain("model-a");
    expect(entry.warmedModels).toContain("model-b");
  });

  it("clears workspace entries", () => {
    const cache = new ZeroLatencyCache();
    cache.upsert({ workspaceRoot: "/p", objectiveDraft: "a" });
    cache.upsert({ workspaceRoot: "/other", objectiveDraft: "b" });
    cache.clearWorkspace("/p");
    expect(cache.get("/p", "a")).toBeUndefined();
    expect(cache.get("/other", "b")).toBeDefined();
  });
});

describe("ZLPreplanner", () => {
  it("returns null without objective draft", () => {
    const planner = new ZLPreplanner(new ZeroLatencyCache());
    expect(planner.preplan({ workspaceRoot: "/p" })).toBeNull();
  });

  it("creates partial plan with low confidence when context is cold", () => {
    const cache = new ZeroLatencyCache();
    const planner = new ZLPreplanner(cache);
    const partial = planner.preplan({
      workspaceRoot: "/p",
      objectiveDraft: "Add middleware",
    });
    expect(partial?.plan.steps.length).toBe(2);
    expect(partial?.confidence).toBe(0.42);
    expect(partial?.plan.risks).toContain("Context is not warm yet.");
  });

  it("raises confidence when relevant files are cached", () => {
    const cache = new ZeroLatencyCache();
    cache.upsert({
      workspaceRoot: "/p",
      objectiveDraft: "Add middleware",
      context: {
        objective: "Add middleware",
        workspaceRoot: "/p",
        relevantFiles: ["src/middleware.ts"],
        symbols: [],
        contextBundle: {
          query: "Add middleware",
          semanticResults: [],
          dependencyGraph: [],
          queryEmbedding: [],
        },
        notes: [],
      },
    });
    const planner = new ZLPreplanner(cache);
    const partial = planner.preplan({ workspaceRoot: "/p", objectiveDraft: "Add middleware" });
    expect(partial?.confidence).toBe(0.72);
    expect(partial?.plan.risks).toHaveLength(0);
  });
});

describe("ZLScheduler", () => {
  it("runs high priority tasks before low priority", async () => {
    const scheduler = new ZLScheduler(1);
    const order: string[] = [];

    scheduler.schedule({
      type: "context",
      priority: "HIGH",
      run: async () => {
        order.push("high");
      },
    });

    scheduler.schedule({
      type: "preplan",
      priority: "LOW",
      run: async () => {
        await new Promise((r) => setTimeout(r, 30));
        order.push("low");
      },
    });

    await vi.waitFor(() => expect(order).toEqual(["high", "low"]), { timeout: 3000 });
  });

  it("skips cancelled token tasks", async () => {
    const scheduler = new ZLScheduler(2);
    const token = scheduler.createToken();
    let ran = false;

    scheduler.cancel(token);

    scheduler.schedule({
      type: "model",
      priority: "HIGH",
      tokenId: token,
      run: async () => {
        await new Promise((r) => setTimeout(r, 200));
        ran = true;
      },
    });

    await new Promise((r) => setTimeout(r, 300));
    expect(ran).toBe(false);
  });
});
