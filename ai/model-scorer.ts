import { getCapabilityRoute } from "./model-capabilities";
import type { ModelProfile } from "./model-profiles";
import type { ModelRequest } from "./types";

export interface ModelScoreWeights {
  weightTask: number;
  weightContext: number;
  weightLatency: number;
  weightCost: number;
  weightSpecialization: number;
}

export interface ModelScoreBreakdown {
  taskScore: number;
  contextScore: number;
  latencyScore: number;
  costScore: number;
  specializationScore: number;
  finalScore: number;
  reasons: string[];
}

export const defaultModelScoreWeights: ModelScoreWeights = {
  weightTask: 0.35,
  weightContext: 0.2,
  weightLatency: 0.15,
  weightCost: 0.1,
  weightSpecialization: 0.2
};

export class ModelScorer {
  constructor(private readonly weights: ModelScoreWeights = defaultModelScoreWeights) {}

  score(profile: ModelProfile, request: ModelRequest): ModelScoreBreakdown {
    const taskScore = this.taskScore(profile, request);
    const contextScore = this.contextScore(profile, request);
    const latencyScore = this.latencyScore(profile, request);
    const costScore = this.costScore(profile, request);
    const specializationScore = this.specializationScore(profile, request);

    const finalScore =
      this.weights.weightTask * taskScore +
      this.weights.weightContext * contextScore +
      this.weights.weightLatency * latencyScore +
      this.weights.weightCost * costScore +
      this.weights.weightSpecialization * specializationScore;

    return {
      taskScore,
      contextScore,
      latencyScore,
      costScore,
      specializationScore,
      finalScore: Math.round(finalScore * 100) / 100,
      reasons: this.reasons(profile, request, { taskScore, contextScore, latencyScore, costScore, specializationScore })
    };
  }

  private taskScore(profile: ModelProfile, request: ModelRequest): number {
    const route = getCapabilityRoute(request.intent);
    if (route?.primaryModel === profile.id) {
      return 100;
    }

    if (route?.fallbackModels.includes(profile.id)) {
      return 75;
    }

    if (request.intent && profile.preferredIntents.includes(request.intent)) {
      return 85;
    }

    return profile.capabilities.includes(request.capability) ? 55 : 0;
  }

  private contextScore(profile: ModelProfile, request: ModelRequest): number {
    const estimatedTokens = this.estimateTokens(request);
    if (estimatedTokens <= profile.contextWindow * 0.5) {
      return 100;
    }

    if (estimatedTokens <= profile.contextWindow * 0.85) {
      return 75;
    }

    if (estimatedTokens <= profile.contextWindow) {
      return 45;
    }

    return 0;
  }

  private latencyScore(profile: ModelProfile, request: ModelRequest): number {
    if (request.intent === "autocomplete" || request.intent === "fast") {
      return profile.latency === "low" ? 100 : profile.latency === "medium" ? 55 : 20;
    }

    if (profile.latency === "low") {
      return 90;
    }

    return profile.latency === "medium" ? 75 : 45;
  }

  private costScore(profile: ModelProfile, request: ModelRequest): number {
    const tier = request.metadata?.userTier ?? "pro";
    const scoreByCost: Record<ModelProfile["costEstimate"], number> = {
      local: 100,
      low: 90,
      medium: 75,
      high: tier === "community" ? 35 : 65,
      premium: tier === "enterprise" ? 80 : 45
    };

    return scoreByCost[profile.costEstimate];
  }

  private specializationScore(profile: ModelProfile, request: ModelRequest): number {
    const intent = request.intent;
    if (!intent) {
      return profile.defaultScore;
    }

    const specializationByIntent: Partial<Record<string, ModelProfile["specialization"][number]>> = {
      kilocode: "coding",
      multi_file: "coding",
      codebase: "coding",
      agent: "tool_use",
      tool_use: "tool_use",
      planning: "planning",
      reasoning: "reasoning",
      deep_thinking: "reasoning",
      debug: "debugging",
      analysis: "debugging",
      autocomplete: "autocomplete",
      fast: "autocomplete",
      documentation: "planning"
    };

    const specialization = specializationByIntent[intent];
    return specialization && profile.specialization.includes(specialization) ? 100 : profile.defaultScore;
  }

  private estimateTokens(request: ModelRequest): number {
    const payload = [
      request.system,
      request.prompt,
      JSON.stringify(request.messages ?? []),
      JSON.stringify(request.context ?? {})
    ].join("\n");

    return Math.ceil(payload.length / 4);
  }

  private reasons(
    profile: ModelProfile,
    request: ModelRequest,
    scores: Omit<ModelScoreBreakdown, "finalScore" | "reasons">
  ): string[] {
    const reasons = [
      `task=${scores.taskScore}`,
      `context=${scores.contextScore}`,
      `latency=${scores.latencyScore}`,
      `cost=${scores.costScore}`,
      `specialization=${scores.specializationScore}`
    ];

    const route = getCapabilityRoute(request.intent);
    if (route?.primaryModel === profile.id) {
      reasons.push(`primary-route:${request.intent}`);
    }

    if (route?.fallbackModels.includes(profile.id)) {
      reasons.push(`fallback-route:${request.intent}`);
    }

    return reasons;
  }
}
