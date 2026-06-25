import type { LogicFlowNodeId } from "../../components/ui/logicflow/types";
import { getModelProfile, modelProfiles, type ModelProfile } from "../model-profiles";
import type { ModelCapability, RoutingIntent } from "../types";
import type { PreloadHistoryRecord } from "./preload-cache";
import type { PreloadSignals, PreloadStage, PreloadTarget } from "./preload-events";

const STAGE_CAPABILITY: Record<PreloadStage, ModelCapability> = {
  suggestions: "reasoning",
  composer: "planning",
  review: "patching",
  chat: "chat",
  autocomplete: "autocomplete",
  context: "embeddings",
};

const STAGE_INTENT: Record<PreloadStage, RoutingIntent> = {
  suggestions: "reasoning",
  composer: "planning",
  review: "kilocode",
  chat: "fallback",
  autocomplete: "autocomplete",
  context: "codebase",
};

const PIPELINE_NEXT: Partial<Record<LogicFlowNodeId, PreloadStage>> = {
  suggestions: "composer",
  composer: "review",
};

function toPreloadStage(node?: LogicFlowNodeId): PreloadStage {
  if (node === "suggestions" || node === "composer" || node === "review") return node;
  return "chat";
}

const EXT_TO_INTENT: Record<string, RoutingIntent> = {
  ts: "kilocode",
  tsx: "kilocode",
  js: "kilocode",
  jsx: "kilocode",
  py: "analysis",
  rs: "analysis",
  go: "analysis",
  md: "documentation",
};

export class PreloadPredictor {
  predictPipelineStage(current?: LogicFlowNodeId): PreloadStage | undefined {
    if (!current) return "suggestions";
    return PIPELINE_NEXT[current];
  }

  inferIntentFromFiles(openFiles: string[] = []): RoutingIntent {
    for (const file of openFiles) {
      const ext = file.split(".").pop()?.toLowerCase();
      if (ext && EXT_TO_INTENT[ext]) return EXT_TO_INTENT[ext];
    }
    return "kilocode";
  }

  predictModels(
    signals: PreloadSignals,
    history: PreloadHistoryRecord[] = [],
    adaptiveWeights: Record<string, number> = {}
  ): PreloadTarget[] {
    const targets: PreloadTarget[] = [];
    const intent = signals.intent ?? this.inferIntentFromFiles(signals.openFiles);
    const stages = this.stagesForSignals(signals);

    for (const stage of stages) {
      const capability = signals.capability ?? STAGE_CAPABILITY[stage];
      const stageIntent = STAGE_INTENT[stage];
      const ranked = this.rankProfiles(capability, stageIntent, history, adaptiveWeights);

      for (const profile of ranked.slice(0, 2)) {
        targets.push({
          modelId: profile.id,
          provider: profile.provider,
          stage,
          capability,
          intent: stageIntent,
          priority: this.scoreProfile(profile, stage, signals, adaptiveWeights),
          strategy: "predictive",
          reason: `Predicted for ${stage} (${profile.displayName})`,
          background: profile.speed === "slow",
        });
      }
    }

    if (signals.selectedModel) {
      const profile = getModelProfile(signals.selectedModel);
      if (profile) {
        targets.unshift({
          modelId: profile.id,
          provider: profile.provider,
          stage: signals.pipelineNode ? toPreloadStage(signals.pipelineNode) : "chat",
          capability: signals.capability ?? "chat",
          intent,
          priority: 100,
          strategy: "contextual",
          reason: "User-selected model",
          background: profile.speed === "slow",
        });
      }
    }

    return this.deduplicateTargets(targets);
  }

  scoreModelForContext(
    profile: ModelProfile,
    signals: PreloadSignals,
    adaptiveWeight = 1
  ): number {
    return this.scoreProfile(
      profile,
      signals.pipelineNode ? toPreloadStage(signals.pipelineNode) : "chat",
      signals,
      { [profile.id]: adaptiveWeight }
    );
  }

  frequencyFromHistory(history: PreloadHistoryRecord[]): Map<string, number> {
    const freq = new Map<string, number>();
    for (const record of history) {
      const key = `${record.modelId}::${record.stage}`;
      freq.set(key, (freq.get(key) ?? 0) + (record.hit ? 2 : 1));
    }
    return freq;
  }

  private stagesForSignals(signals: PreloadSignals): PreloadStage[] {
    if (signals.pipelineNode) {
      const current = toPreloadStage(signals.pipelineNode);
      const next = this.predictPipelineStage(signals.pipelineNode);
      const stages: PreloadStage[] = [current];
      if (next) stages.push(next);
      return stages;
    }

    switch (signals.userAction) {
      case "composer.open":
      case "composer.run":
        return ["composer", "review"];
      case "suggestions.submit":
        return ["suggestions", "composer"];
      case "review.open":
        return ["review", "composer"];
      case "chat.focus":
      case "chat.stream":
        return ["chat"];
      case "autocomplete":
        return ["autocomplete"];
      case "workspace.open":
        return ["context", "chat", "suggestions"];
      default:
        return ["chat", "suggestions"];
    }
  }

  private rankProfiles(
    capability: ModelCapability,
    intent: RoutingIntent,
    history: PreloadHistoryRecord[],
    adaptiveWeights: Record<string, number>
  ): ModelProfile[] {
    const freq = this.frequencyFromHistory(history);
    return modelProfiles
      .filter((p) => p.capabilities.includes(capability))
      .sort((a, b) => {
        const scoreA =
          a.defaultScore +
          (freq.get(`${a.id}::${this.stageForCapability(capability)}`) ?? 0) * 3 +
          (adaptiveWeights[a.id] ?? 1) * 10 +
          (a.speed === "ultra_fast" || a.speed === "fast" ? 8 : a.speed === "slow" ? -5 : 0);
        const scoreB =
          b.defaultScore +
          (freq.get(`${b.id}::${this.stageForCapability(capability)}`) ?? 0) * 3 +
          (adaptiveWeights[b.id] ?? 1) * 10 +
          (b.speed === "ultra_fast" || b.speed === "fast" ? 8 : b.speed === "slow" ? -5 : 0);
        return scoreB - scoreA;
      });
  }

  private stageForCapability(capability: ModelCapability): PreloadStage {
    for (const [stage, cap] of Object.entries(STAGE_CAPABILITY) as [PreloadStage, ModelCapability][]) {
      if (cap === capability) return stage;
    }
    return "chat";
  }

  private scoreProfile(
    profile: ModelProfile,
    stage: PreloadStage,
    signals: PreloadSignals,
    adaptiveWeights: Record<string, number>
  ): number {
    let score = profile.defaultScore + (adaptiveWeights[profile.id] ?? 1) * 12;

    if (profile.speed === "ultra_fast" || profile.speed === "fast") score += 15;
    if (profile.speed === "slow") score -= 8;

    if (profile.costEstimate === "local") score += 6;

    if (signals.activeFile && profile.specialization.includes("coding")) score += 4;
    if (signals.openFiles?.some((f) => f.endsWith(".test.ts") || f.endsWith(".spec.ts"))) {
      if (profile.specialization.includes("debugging")) score += 5;
    }

    if (stage === "suggestions" && profile.capabilities.includes("reasoning")) score += 6;
    if (stage === "composer" && profile.capabilities.includes("planning")) score += 6;
    if (stage === "review" && profile.capabilities.includes("patching")) score += 6;

    return Math.round(score);
  }

  private deduplicateTargets(targets: PreloadTarget[]): PreloadTarget[] {
    const seen = new Set<string>();
    const result: PreloadTarget[] = [];
    for (const target of targets.sort((a, b) => b.priority - a.priority)) {
      const key = `${target.modelId}::${target.stage}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(target);
    }
    return result;
  }
}

export const preloadPredictor = new PreloadPredictor();
