import type { ComposerPlan } from "../types";
import { zeroLatencyCache, type ZeroLatencyCache } from "./zl-cache";
import type { ZLPartialPlan, ZLSignals } from "./zl-types";
import { ZL_LOG_PREFIX } from "./zl-types";

export class ZLPreplanner {
  constructor(private readonly cache: ZeroLatencyCache = zeroLatencyCache) {}

  preplan(signals: ZLSignals): ZLPartialPlan | null {
    const objective = signals.objectiveDraft?.trim();
    if (!objective) return null;

    const cached = this.cache.get(signals.workspaceRoot, objective);
    const relevantFiles = cached?.context?.relevantFiles ?? signals.openFiles ?? [];
    const symbols = cached?.context?.symbols.map((symbol) => symbol.name) ?? [];

    const plan: ComposerPlan = {
      objective,
      steps: [
        {
          id: "zl-step-1",
          title: "Load relevant context and symbols",
          rationale: "Zero Latency Composer preloads the likely context before the full Composer request.",
          files: relevantFiles.slice(0, 8),
          symbols: symbols.slice(0, 12),
          risk: "low",
        },
        {
          id: "zl-step-2",
          title: "Draft implementation plan",
          rationale: "Use cached context as a starter plan; final Composer can replace this with model output.",
          files: relevantFiles.slice(0, 8),
          symbols: symbols.slice(0, 12),
          risk: relevantFiles.length > 8 ? "medium" : "low",
        },
      ],
      risks: relevantFiles.length === 0 ? ["Context is not warm yet."] : [],
      validation: ["typecheck", "build"],
    };

    const partial: ZLPartialPlan = {
      objective,
      plan,
      confidence: relevantFiles.length > 0 ? 0.72 : 0.42,
      createdAt: Date.now(),
    };

    this.cache.upsert({
      workspaceRoot: signals.workspaceRoot,
      objectiveDraft: objective,
      partialPlan: partial,
    });
    console.log(`${ZL_LOG_PREFIX} partial plan ready (${partial.confidence})`);
    return partial;
  }
}

export const zlPreplanner = new ZLPreplanner();
