/**
 * Typed NVIDIA NIM + local-offline catalog.
 * Provider HTTP still goes through HttpChatProvider — this is routing metadata only.
 */

export const NVIDIA_NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";
export const NVIDIA_NIM_CHAT_COMPLETIONS_URL = `${NVIDIA_NIM_BASE_URL}/chat/completions`;

export type ModelCatalogTier = "agentic" | "code" | "fast" | "local";
export type ModelRecommendedFor =
  | "agentic"
  | "code"
  | "fast"
  | "ask"
  | "autocomplete"
  | "offline";

export interface TypedModelCatalogEntry {
  providerId: string;
  modelId: string;
  displayName: string;
  tier: ModelCatalogTier;
  supportsTools: boolean;
  recommendedFor: readonly ModelRecommendedFor[];
  /** Caval profile id in model-profiles. */
  profileId: string;
}

export const NVIDIA_NIM_CATALOG: readonly TypedModelCatalogEntry[] = [
  {
    providerId: "nvidia",
    modelId: "deepseek-ai/deepseek-v4-flash-0731",
    displayName: "DeepSeek V4 Flash",
    tier: "agentic",
    supportsTools: true,
    recommendedFor: ["agentic", "code"],
    profileId: "nvidia-deepseek-v4-flash",
  },
  {
    providerId: "nvidia",
    modelId: "qwen/qwen3.5-122b-a10b",
    displayName: "Qwen 3.5 122B",
    tier: "agentic",
    supportsTools: true,
    recommendedFor: ["agentic", "code"],
    profileId: "nvidia-qwen3.5-122b",
  },
  {
    providerId: "nvidia",
    modelId: "nvidia/nemotron-3-nano-30b-a3b",
    displayName: "Nemotron 3 Nano 30B",
    tier: "fast",
    supportsTools: true,
    recommendedFor: ["fast", "code"],
    profileId: "nvidia-nemotron-3-nano",
  },
] as const;

export const LOCAL_OFFLINE_CATALOG: readonly TypedModelCatalogEntry[] = [
  {
    providerId: "open_source",
    modelId: "qwen2.5-coder:7b",
    displayName: "Qwen 2.5 Coder 7B",
    tier: "local",
    supportsTools: false,
    recommendedFor: ["ask", "autocomplete", "offline", "code"],
    profileId: "qwen2.5-coder:7b",
  },
] as const;

export const AGENTIC_NVIDIA_PRIMARY_PROFILE_ID = "nvidia-deepseek-v4-flash";
export const AGENTIC_NVIDIA_FALLBACK_PROFILE_ID = "nvidia-qwen3.5-122b";
export const NVIDIA_FAST_PROFILE_ID = "nvidia-nemotron-3-nano";
export const LOCAL_OFFLINE_PROFILE_ID = "qwen2.5-coder:7b";

export function nvidiaCatalogByProfileId(
  profileId: string
): TypedModelCatalogEntry | undefined {
  return NVIDIA_NIM_CATALOG.find((entry) => entry.profileId === profileId);
}

export function isAgenticNimModel(profileId: string): boolean {
  const entry = nvidiaCatalogByProfileId(profileId);
  return Boolean(entry?.supportsTools && entry.recommendedFor.includes("agentic"));
}
