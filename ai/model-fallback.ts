import { getCapabilityRoute } from "./model-capabilities";
import { getModelProfile, modelProfiles, type ModelProfile } from "./model-profiles";
import type { ModelRequest } from "./types";

export interface FallbackDecision {
  candidates: ModelProfile[];
  reason: string;
}

export class ModelFallbackPlanner {
  candidatesFor(request: ModelRequest, failedModelIds: string[] = []): FallbackDecision {
    const failed = new Set(failedModelIds);
    const route = getCapabilityRoute(request.intent);
    const routeModels = [
      route?.primaryModel,
      ...(route?.fallbackModels ?? [])
    ].flatMap((modelId) => {
      const profile = modelId ? getModelProfile(modelId) : undefined;
      return profile ? [profile] : [];
    });

    const capabilityModels = modelProfiles.filter((profile) =>
      profile.capabilities.includes(request.capability) && !routeModels.some((routeModel) => routeModel.id === profile.id)
    );

    const candidates = [...routeModels, ...capabilityModels]
      .filter((profile) => !failed.has(profile.id))
      .filter((profile) => this.intentFallbackAllowed(profile, request));

    return {
      candidates,
      reason: route?.reason ?? "No explicit intent route; using capability-compatible models."
    };
  }

  fallbackForFailure(request: ModelRequest, failedModelId: string): ModelProfile[] {
    const failed = [failedModelId];

    if (request.intent === "autocomplete" || request.intent === "fast") {
      return ["north-mini-code", "qwen2.5-coder:7b"]
        .flatMap((id) => {
          const profile = getModelProfile(id);
          return profile && !failed.includes(profile.id) ? [profile] : [];
        });
    }

    if (request.intent === "reasoning" || request.intent === "deep_thinking") {
      return ["stepfun-step-3-7-flash", "llama3.1:70b"]
        .flatMap((id) => {
          const profile = getModelProfile(id);
          return profile && !failed.includes(profile.id) ? [profile] : [];
        });
    }

    return this.candidatesFor(request, failed).candidates;
  }

  private intentFallbackAllowed(profile: ModelProfile, request: ModelRequest): boolean {
    if (request.tools?.length && !profile.supportsToolCalling) {
      return profile.provider === "open_source" ? false : profile.capabilities.includes(request.capability);
    }

    return profile.capabilities.includes(request.capability);
  }
}
