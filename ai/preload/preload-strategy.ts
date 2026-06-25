import type { PreloadCache } from "./preload-cache";
import type { PreloadPredictor } from "./preload-predictor";
import type { PreloadSignals, PreloadStrategyName, PreloadTarget, PreloadTask } from "./preload-events";
import { randomUUID } from "node:crypto";

export interface PreloadStrategy {
  readonly name: PreloadStrategyName;
  plan(signals: PreloadSignals, cache: PreloadCache, predictor: PreloadPredictor): PreloadTarget[];
}

/** Predictive — anticipates next models from history + heuristics */
export class PredictiveStrategy implements PreloadStrategy {
  readonly name = "predictive" as const;

  plan(signals: PreloadSignals, cache: PreloadCache, predictor: PreloadPredictor): PreloadTarget[] {
    const snapshot = cache.getSnapshot();
    return predictor
      .predictModels(signals, snapshot.history, snapshot.adaptiveWeights)
      .map((t) => ({ ...t, strategy: "predictive" as const }));
  }
}

/** Contextual — open files, active tab, workspace */
export class ContextualStrategy implements PreloadStrategy {
  readonly name = "contextual" as const;

  plan(signals: PreloadSignals, cache: PreloadCache, predictor: PreloadPredictor): PreloadTarget[] {
    if (!signals.workspaceRoot && !signals.openFiles?.length) return [];

    const enriched: PreloadSignals = {
      ...signals,
      userAction: signals.userAction ?? "workspace.open",
      openFiles: signals.openFiles ?? (signals.activeFile ? [signals.activeFile] : []),
    };

    return predictor
      .predictModels(enriched, cache.getHistory(), cache.getSnapshot().adaptiveWeights)
      .filter((t) => t.provider === "open_source" || t.priority >= 70)
      .map((t) => ({ ...t, strategy: "contextual" as const }));
  }
}

/** Orchestrated — Suggestions → Composer → Review pipeline stages */
export class OrchestratedStrategy implements PreloadStrategy {
  readonly name = "orchestrated" as const;

  private readonly pipelineStages = [
    { stage: "suggestions" as const, capability: "reasoning" as const, intent: "reasoning" as const },
    { stage: "composer" as const, capability: "planning" as const, intent: "planning" as const },
    { stage: "review" as const, capability: "patching" as const, intent: "kilocode" as const },
  ];

  plan(signals: PreloadSignals, cache: PreloadCache, predictor: PreloadPredictor): PreloadTarget[] {
    const node = signals.pipelineNode ?? "suggestions";
    const startIdx = this.pipelineStages.findIndex((s) => s.stage === node);
    const stages = startIdx >= 0 ? this.pipelineStages.slice(startIdx, startIdx + 2) : this.pipelineStages.slice(0, 2);

    const snapshot = cache.getSnapshot();
    const targets: PreloadTarget[] = [];

    for (const { stage, capability, intent } of stages) {
      const [best] = predictor.predictModels(
        { ...signals, pipelineNode: stage, capability, intent },
        snapshot.history,
        snapshot.adaptiveWeights
      );
      if (best) {
        targets.push({
          ...best,
          stage,
          capability,
          intent,
          strategy: "orchestrated",
          reason: `Pipeline stage ${stage}`,
          priority: best.priority + (stage === node ? 10 : 0),
        });
      }
    }

    return targets;
  }
}

/** Parallel — fast models first, slow models marked background */
export class ParallelStrategy implements PreloadStrategy {
  readonly name = "parallel" as const;

  plan(signals: PreloadSignals, cache: PreloadCache, predictor: PreloadPredictor): PreloadTarget[] {
    return predictor
      .predictModels(signals, cache.getHistory(), cache.getSnapshot().adaptiveWeights)
      .map((t) => ({
        ...t,
        strategy: "parallel" as const,
        background: t.background ?? false,
        priority: t.background ? t.priority - 20 : t.priority + 10,
      }));
  }
}

/** Lazy — only preload if cache miss likely (no ready entry) */
export class LazyStrategy implements PreloadStrategy {
  readonly name = "lazy" as const;

  plan(signals: PreloadSignals, cache: PreloadCache, predictor: PreloadPredictor): PreloadTarget[] {
    return predictor
      .predictModels(signals, cache.getHistory(), cache.getSnapshot().adaptiveWeights)
      .filter((t) => !cache.isReady(t.modelId, t.stage))
      .map((t) => ({ ...t, strategy: "lazy" as const, priority: t.priority - 5 }));
  }
}

/** Warm cache — re-warm recently used models */
export class WarmCacheStrategy implements PreloadStrategy {
  readonly name = "warm-cache" as const;

  plan(_signals: PreloadSignals, cache: PreloadCache): PreloadTarget[] {
    return cache
      .list()
      .filter((e) => e.hitCount > 0 && e.status !== "ready")
      .map((e) => ({
        modelId: e.modelId,
        provider: e.provider,
        stage: e.stage,
        capability: "chat" as const,
        priority: 60 + e.hitCount * 5,
        strategy: "warm-cache" as const,
        reason: `Re-warm ${e.modelId} (${e.hitCount} hits)`,
        background: false,
      }));
  }
}

/** Adaptive — boost models with high hit ratio, skip low performers */
export class AdaptiveStrategy implements PreloadStrategy {
  readonly name = "adaptive" as const;

  plan(signals: PreloadSignals, cache: PreloadCache, predictor: PreloadPredictor): PreloadTarget[] {
    const weights = cache.getSnapshot().adaptiveWeights;
    return predictor
      .predictModels(signals, cache.getHistory(), weights)
      .filter((t) => (weights[t.modelId] ?? 1) >= 0.5)
      .map((t) => ({
        ...t,
        strategy: "adaptive" as const,
        priority: Math.round(t.priority * (weights[t.modelId] ?? 1)),
      }));
  }
}

export function createDefaultStrategies(): PreloadStrategy[] {
  return [
    new PredictiveStrategy(),
    new ContextualStrategy(),
    new OrchestratedStrategy(),
    new ParallelStrategy(),
    new LazyStrategy(),
    new WarmCacheStrategy(),
    new AdaptiveStrategy(),
  ];
}

export function mergeTargets(strategies: PreloadStrategy[], signals: PreloadSignals, cache: PreloadCache, predictor: PreloadPredictor): PreloadTask[] {
  const merged = new Map<string, PreloadTarget>();

  for (const strategy of strategies) {
    for (const target of strategy.plan(signals, cache, predictor)) {
      const key = `${target.modelId}::${target.stage}`;
      const existing = merged.get(key);
      if (!existing || target.priority > existing.priority) {
        merged.set(key, target);
      }
    }
  }

  return Array.from(merged.values())
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 8)
    .map((target) => ({
      ...target,
      taskId: randomUUID(),
      createdAt: Date.now(),
    }));
}
