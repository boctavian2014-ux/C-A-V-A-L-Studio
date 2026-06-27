// ──────────────────────────────────────────────
//  Auto model routing — caval-auto/free|balanced|frontier
// ──────────────────────────────────────────────

import { ModelRouter } from "../model-router";
import { modelProfiles, getModelProfile, type ModelProfile } from "../model-profiles";
import type { RoutingIntent } from "../types";
import type { AutoTierId, ModelSelectionId } from "./model-catalog";
import { isAutoTier } from "./model-catalog";
import { getOllamaBaseUrl, isOllamaReachable } from "./ollama-client";

import { hasOpenRouterKey } from "./model-readiness";

export { isOllamaReachable } from "./ollama-client";
export interface ResolvedModel {
  selectionId: ModelSelectionId;
  modelId: string;
  provider: string;
  reason: string;
}

const OLLAMA_TAGS_URL = getOllamaBaseUrl();

let installedOllamaModels: string[] | null = null;
let ollamaFetchedAt = 0;
const OLLAMA_CACHE_MS = 30_000;

async function getInstalledOllamaModels(): Promise<string[]> {
  if (installedOllamaModels && Date.now() - ollamaFetchedAt < OLLAMA_CACHE_MS) {
    return installedOllamaModels;
  }
  try {
    const res = await fetch(`${OLLAMA_TAGS_URL}/api/tags`);
    if (!res.ok) return installedOllamaModels ?? [];
    const json = (await res.json()) as { models?: Array<{ name: string }> };
    installedOllamaModels = (json.models ?? []).map((m) => m.name.split(":")[0] === m.name ? m.name : m.name);
    ollamaFetchedAt = Date.now();
    return installedOllamaModels;
  } catch {
    return installedOllamaModels ?? [];
  }
}

function ollamaNameMatches(installed: string[], profileId: string): boolean {
  const base = profileId.split(":")[0];
  return installed.some((name) => name === profileId || name.startsWith(`${base}:`) || name === base);
}

function localFreeProfiles(): ModelProfile[] {
  return modelProfiles.filter((p) => p.costEstimate === "local");
}

/** Auto Free preferă modele mici/rapide — nu 32B/70B by default */
const AUTO_FREE_ORDER = [
  "qwen2.5-coder:7b",
  "llama3.1:8b",
  "qwen2.5-coder:32b",
  "llama3.1:70b",
];

function sortForAutoFree(profiles: ModelProfile[]): ModelProfile[] {
  return [...profiles].sort((a, b) => {
    const ai = AUTO_FREE_ORDER.indexOf(a.id);
    const bi = AUTO_FREE_ORDER.indexOf(b.id);
    const aRank = ai === -1 ? 99 : ai;
    const bRank = bi === -1 ? 99 : bi;
    return aRank - bRank || b.defaultScore - a.defaultScore;
  });
}

function rankLocalFree(installed: string[]): ModelProfile[] {
  const locals = localFreeProfiles();
  const installedAvailable = locals.filter((p) => ollamaNameMatches(installed, p.id));
  if (installedAvailable.length > 0) {
    return sortForAutoFree(installedAvailable);
  }
  // Ollama down sau fără modele — sugerează 7B, nu cel mai mare
  const default7b = locals.find((p) => p.id === "qwen2.5-coder:7b");
  return default7b ? [default7b] : sortForAutoFree(locals);
}

/** Lista ordonată de încercat pentru Auto Free (cu fallback) */
export async function getAutoFreeModelCandidates(): Promise<string[]> {
  if (hasOpenRouterKey()) {
    return [
      "stepfun-step-3-7-flash",
      ...getAutoBalancedModelCandidates().filter((id) => id !== "stepfun-step-3-7-flash"),
    ];
  }
  const installed = await getInstalledOllamaModels();
  return rankLocalFree(installed).map((p) => p.id);
}

/** Lista ordonată de fallback pentru Auto Balanced (cloud, non-premium) */
export function getAutoBalancedModelCandidates(intent: RoutingIntent = "kilocode"): string[] {
  const router = new ModelRouter();
  const ranked = router.rank({
    prompt: "",
    capability: "chat",
    intent,
    metadata: { userTier: "pro" },
  });
  return ranked
    .filter((r) => r.model.costEstimate !== "premium" && r.model.costEstimate !== "local")
    .map((r) => r.model.id);
}

export const FAST_CHAT_MODEL_ID = "stepfun-step-3-7-flash";

export async function resolveAutoModel(
  tier: AutoTierId,
  intent: RoutingIntent = "kilocode"
): Promise<ResolvedModel> {
  const router = new ModelRouter();

  if (tier === "caval-auto/free") {
    if (hasOpenRouterKey()) {
      return {
        selectionId: tier,
        modelId: "stepfun-step-3-7-flash",
        provider: "openrouter",
        reason: "Auto Free: OpenRouter activ — StepFun Flash (rapid, cloud)",
      };
    }
    const installed = await getInstalledOllamaModels();
    const ranked = rankLocalFree(installed);
    const [best] = ranked;
    const modelId = best?.id ?? "qwen2.5-coder:7b";
    const reachable = await isOllamaReachable();
    return {
      selectionId: tier,
      modelId,
      provider: "open_source",
      reason: !reachable
        ? "Auto Free: Ollama nu răspunde — va încerca qwen2.5-coder:7b"
        : installed.length > 0
          ? `Auto Free: ${modelId} (instalat local)`
          : `Auto Free: ${modelId} (fallback — rulează ollama pull ${modelId})`,
    };
  }

  if (tier === "caval-auto/balanced" && hasOpenRouterKey()) {
    return {
      selectionId: tier,
      modelId: FAST_CHAT_MODEL_ID,
      provider: "openrouter",
      reason: "Auto Balanced: StepFun Flash (latency)",
    };
  }

  const capability = tier === "caval-auto/frontier" ? "reasoning" : "chat";
  const routingIntent: RoutingIntent =
    tier === "caval-auto/frontier"
      ? "deep_thinking"
      : intent;

  const ranked = router.rank({
    prompt: "",
    capability: capability as "chat" | "reasoning",
    intent: routingIntent,
    metadata: { userTier: tier === "caval-auto/balanced" ? "pro" : "enterprise" },
  });

  const filtered =
    tier === "caval-auto/balanced"
      ? ranked.filter((r) => r.model.costEstimate !== "premium" && r.model.costEstimate !== "local")
      : ranked.filter((r) => r.model.costEstimate !== "local");

  const best = filtered[0] ?? ranked[0];
  if (!best) {
    const fallback = localFreeProfiles()[0];
    return {
      selectionId: tier,
      modelId: fallback?.id ?? "qwen2.5-coder:7b",
      provider: "open_source",
      reason: "Auto fallback local",
    };
  }

  return {
    selectionId: tier,
    modelId: best.model.id,
    provider: best.model.provider,
    reason: `Auto ${tier.split("/")[1]}: ${best.reasons.join("; ")}`,
  };
}

export async function resolveModelSelection(
  selectionId: ModelSelectionId,
  intent: RoutingIntent = "kilocode"
): Promise<ResolvedModel> {
  const cacheKey = `${selectionId}:${intent}`;
  const now = Date.now();
  if (resolveCache && resolveCache.key === cacheKey && now - resolveCache.at < RESOLVE_CACHE_MS) {
    return resolveCache.value;
  }

  const result = await resolveModelSelectionUncached(selectionId, intent);
  resolveCache = { key: cacheKey, at: now, value: result };
  return result;
}

const RESOLVE_CACHE_MS = 60_000;
let resolveCache: { key: string; at: number; value: ResolvedModel } | null = null;

async function resolveModelSelectionUncached(
  selectionId: ModelSelectionId,
  intent: RoutingIntent = "kilocode"
): Promise<ResolvedModel> {
  if (isAutoTier(selectionId)) {
    return resolveAutoModel(selectionId, intent);
  }

  const profile = getModelProfile(selectionId);
  if (profile) {
    return {
      selectionId,
      modelId: profile.id,
      provider: profile.provider,
      reason: "Direct profile selection",
    };
  }

  if (selectionId.startsWith("openrouter:")) {
    return {
      selectionId,
      modelId: selectionId.replace(/^openrouter:/, ""),
      provider: "openrouter",
      reason: "OpenRouter model",
    };
  }

  return {
    selectionId,
    modelId: selectionId,
    provider: "byok",
    reason: "BYOK provider model",
  };
}
