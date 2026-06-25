import { modelProfiles, type ModelProfile } from "../model-profiles";
import type { AIModelConfig, AIModelId, AIModelKind, AIModelRuntime, PreloadContext } from "./model-types";

/** Core models preloaded at IDE startup. */
export const CORE_MODEL_IDS = {
  reasoning: "nex-n2-pro",
  coding: "poolside-laguna-m-1",
  autocomplete: "north-mini-code",
} as const satisfies Record<string, AIModelId>;

/** Local fallback when cloud models are unavailable. */
export const LOCAL_FALLBACK_ID: AIModelId = "qwen2.5-coder:7b";

const KIND_BY_SPECIALIZATION: Partial<Record<ModelProfile["specialization"][number], AIModelKind>> = {
  coding: "coding",
  reasoning: "reasoning",
  autocomplete: "autocomplete",
  tool_use: "tools",
  planning: "general",
  debugging: "general",
};

function runtimeForProvider(provider: string): AIModelRuntime {
  if (provider === "open_source") return "local_ollama";
  return "http";
}

function sizeEstimateMb(profile: ModelProfile): number {
  if (profile.costEstimate === "local") {
    if (profile.id.includes("70b") || profile.id.includes("32b")) return 20_000;
    if (profile.id.includes("8b") || profile.id.includes("7b")) return 5_000;
    return 8_000;
  }
  return 0;
}

function kindForProfile(profile: ModelProfile): AIModelKind {
  for (const spec of profile.specialization) {
    const kind = KIND_BY_SPECIALIZATION[spec];
    if (kind) return kind;
  }
  return "general";
}

export function profileToConfig(profile: ModelProfile): AIModelConfig {
  return {
    id: profile.id,
    displayName: profile.displayName,
    kind: kindForProfile(profile),
    runtime: runtimeForProvider(profile.provider),
    provider: profile.provider,
    endpoint: profile.endpoint,
    sizeEstimateMb: sizeEstimateMb(profile),
    capabilities: profile.capabilities,
    priority: profile.priority,
  };
}

const registry = new Map<AIModelId, AIModelConfig>(
  modelProfiles.map((p) => [p.id, profileToConfig(p)])
);

export function getModelConfig(modelId: AIModelId): AIModelConfig | undefined {
  return registry.get(modelId);
}

export function listAllModels(): AIModelConfig[] {
  return Array.from(registry.values()).sort((a, b) => b.priority - a.priority);
}

export function getCoreModelConfigs(): AIModelConfig[] {
  return Object.values(CORE_MODEL_IDS)
    .map((id) => getModelConfig(id))
    .filter((c): c is AIModelConfig => c != null);
}

export function getModelsForContext(context: PreloadContext): AIModelConfig[] {
  const ids = new Set<AIModelId>();
  const lang = context.language.toLowerCase();
  const type = context.projectType.toLowerCase();

  if (lang === "ts" || lang === "tsx" || lang === "javascript" || lang === "js" || lang === "jsx") {
    ids.add(CORE_MODEL_IDS.coding);
    ids.add(CORE_MODEL_IDS.reasoning);
    ids.add(LOCAL_FALLBACK_ID);
  }

  if (type === "backend") {
    ids.add(CORE_MODEL_IDS.reasoning);
    const toolsModel = Array.from(registry.values()).find((m) => m.kind === "tools");
    if (toolsModel) ids.add(toolsModel.id);
  }

  if (type === "mobile" || type === "frontend") {
    ids.add(CORE_MODEL_IDS.coding);
    const uiModel = listAllModels().find((m) => m.capabilities.includes("code"));
    if (uiModel) ids.add(uiModel.id);
  }

  if (ids.size === 0) {
    ids.add(CORE_MODEL_IDS.coding);
    ids.add(LOCAL_FALLBACK_ID);
  }

  return [...ids]
    .map((id) => getModelConfig(id))
    .filter((c): c is AIModelConfig => c != null);
}

export function registerModelConfig(config: AIModelConfig): void {
  registry.set(config.id, config);
}
