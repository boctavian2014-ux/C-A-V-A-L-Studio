import { ModelRouter } from "../../model-router";
import { preloadModel } from "../../models/model-preload";
import { zeroLatencyCache, type ZeroLatencyCache } from "./zl-cache";
import type { ZLSignals } from "./zl-types";
import { ZL_LOG_PREFIX } from "./zl-types";

export class ZLModelPreloader {
  constructor(
    private readonly router = new ModelRouter(),
    private readonly cache: ZeroLatencyCache = zeroLatencyCache
  ) {}

  preload(signals: ZLSignals): void {
    const planning = this.router.predictModelForTask({ capability: "planning", intent: "planning" });
    const coding = this.router.predictModelForTask({ capability: "code", intent: "kilocode" });
    const models = Array.from(new Set([planning.model, coding.model, "qwen2.5-coder:7b"]));

    for (const model of models) {
      console.log(`${ZL_LOG_PREFIX} preload model ${model}`);
      preloadModel(model, { background: true, priority: 90 });
    }

    this.cache.upsert({
      workspaceRoot: signals.workspaceRoot,
      objectiveDraft: signals.objectiveDraft,
      warmedModels: models,
    });
  }
}

export const zlModelPreloader = new ZLModelPreloader();
