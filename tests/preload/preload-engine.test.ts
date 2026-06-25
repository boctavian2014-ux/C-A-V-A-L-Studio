import { describe, expect, it } from "vitest";

import { PreloadCache } from "../../ai/preload/preload-cache";
import { PreloadPredictor } from "../../ai/preload/preload-predictor";
import { mergeTargets, createDefaultStrategies } from "../../ai/preload/preload-strategy";

describe("PreloadPredictor", () => {
  const predictor = new PreloadPredictor();

  it("predicts next pipeline stage", () => {
    expect(predictor.predictPipelineStage("suggestions")).toBe("composer");
    expect(predictor.predictPipelineStage("composer")).toBe("review");
  });

  it("infers intent from TypeScript files", () => {
    expect(predictor.inferIntentFromFiles(["src/app.tsx"])).toBe("kilocode");
  });

  it("returns ranked preload targets for workspace open", () => {
    const targets = predictor.predictModels({
      workspaceRoot: "/tmp/project",
      userAction: "workspace.open",
      timestamp: Date.now(),
    });
    expect(targets.length).toBeGreaterThan(0);
    expect(targets[0].modelId).toBeTruthy();
  });
});

describe("PreloadCache", () => {
  it("tracks ready state and touch hits", () => {
    const cache = new PreloadCache();
    cache.setWarming("qwen2.5-coder:7b", "open_source", "chat", "predictive", 80);
    expect(cache.isReady("qwen2.5-coder:7b", "chat")).toBe(false);
    cache.markReady("qwen2.5-coder:7b", "chat", 1200);
    expect(cache.isReady("qwen2.5-coder:7b", "chat")).toBe(true);
    cache.touch("qwen2.5-coder:7b", "chat", true);
    expect(cache.get("qwen2.5-coder:7b", "chat")?.hitCount).toBe(1);
  });

  it("evicts stale entries", () => {
    const cache = new PreloadCache();
    cache.setWarming("llama3.1:8b", "open_source", "chat", "lazy", 50);
    cache.markReady("llama3.1:8b", "chat");
    const evictable = cache.listEvictable();
    expect(evictable.some((e) => e.modelId === "llama3.1:8b")).toBe(true);
  });
});

describe("PreloadStrategy merge", () => {
  it("merges strategies without duplicate model+stage keys", () => {
    const cache = new PreloadCache();
    const predictor = new PreloadPredictor();
    const tasks = mergeTargets(createDefaultStrategies(), {
      workspaceRoot: "/tmp",
      userAction: "composer.run",
      pipelineNode: "composer",
      timestamp: Date.now(),
    }, cache, predictor);

    const keys = new Set(tasks.map((t) => `${t.modelId}::${t.stage}`));
    expect(keys.size).toBe(tasks.length);
    expect(tasks.length).toBeGreaterThan(0);
  });
});
