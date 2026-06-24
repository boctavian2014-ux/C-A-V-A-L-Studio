import type { ModelCapability, ModelDescriptor, RoutingIntent } from "./types";

export type ModelProviderId = "poolside" | "openrouter" | "nvidia" | "north" | "open_source";
export type ModelSpeed = "slow" | "balanced" | "fast" | "ultra_fast";
export type ModelCost = "local" | "low" | "medium" | "high" | "premium";
export type ModelLatency = "low" | "medium" | "high";
export type ModelSpecialization = "coding" | "reasoning" | "debugging" | "tool_use" | "autocomplete" | "planning";

const readProcessEnv = (key: string): string | undefined => {
  if (typeof process !== "undefined" && process.env?.[key]) {
    return process.env[key];
  }
  return undefined;
};

const OLLAMA_ENDPOINT = readProcessEnv("OLLAMA_BASE_URL") ?? "http://localhost:11434/api/chat";

export interface ModelProfile extends ModelDescriptor {
  provider: ModelProviderId;
  name: string;
  speed: ModelSpeed;
  costEstimate: ModelCost;
  latency: ModelLatency;
  specialization: ModelSpecialization[];
  defaultScore: number;
}

export const modelProfiles: ModelProfile[] = [
  {
    id: "poolside-laguna-m-1",
    name: "Poolside Laguna M.1",
    displayName: "Poolside Laguna M.1",
    provider: "poolside",
    capabilities: ["chat", "code", "reasoning", "planning", "patching"],
    priority: 100,
    contextWindow: 256_000,
    supportsStreaming: true,
    supportsToolCalling: false,
    preferredIntents: ["kilocode", "multi_file", "codebase"],
    endpoint: "https://api.poolside.ai/v1/chat/completions",
    speed: "balanced",
    costEstimate: "premium",
    latency: "medium",
    specialization: ["coding", "planning"],
    defaultScore: 95
  },
  {
    id: "nex-n2-pro",
    name: "Nex N2 Pro",
    displayName: "Nex N2 Pro",
    provider: "openrouter",
    capabilities: ["chat", "code", "reasoning"],
    priority: 92,
    contextWindow: 128_000,
    supportsStreaming: true,
    supportsToolCalling: true,
    preferredIntents: ["reasoning", "deep_thinking"],
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    speed: "balanced",
    costEstimate: "high",
    latency: "medium",
    specialization: ["reasoning", "coding"],
    defaultScore: 92
  },
  {
    id: "stepfun-step-3-7-flash",
    name: "StepFun Step 3.7 Flash",
    displayName: "StepFun Step 3.7 Flash",
    provider: "openrouter",
    capabilities: ["chat", "code", "planning", "tool_use"],
    priority: 90,
    contextWindow: 64_000,
    supportsStreaming: true,
    supportsToolCalling: true,
    preferredIntents: ["agent", "tool_use", "planning"],
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    speed: "fast",
    costEstimate: "medium",
    latency: "low",
    specialization: ["tool_use", "planning", "coding"],
    defaultScore: 90
  },
  {
    id: "nvidia-nemotron-3-ultra",
    name: "NVIDIA Nemotron-3 Ultra",
    displayName: "NVIDIA Nemotron-3 Ultra",
    provider: "nvidia",
    capabilities: ["chat", "code", "reasoning", "debug"],
    priority: 95,
    contextWindow: 128_000,
    supportsStreaming: true,
    supportsToolCalling: false,
    preferredIntents: ["debug", "analysis"],
    endpoint: "https://integrate.api.nvidia.com/v1/chat/completions",
    speed: "balanced",
    costEstimate: "high",
    latency: "medium",
    specialization: ["debugging", "reasoning"],
    defaultScore: 94
  },
  {
    id: "north-mini-code",
    name: "North Mini Code",
    displayName: "North Mini Code",
    provider: "north",
    capabilities: ["chat", "code", "autocomplete"],
    priority: 85,
    contextWindow: 32_000,
    supportsStreaming: true,
    supportsToolCalling: false,
    preferredIntents: ["autocomplete", "fast"],
    endpoint: "https://api.north.ai/v1/chat/completions",
    speed: "ultra_fast",
    costEstimate: "low",
    latency: "low",
    specialization: ["autocomplete", "coding"],
    defaultScore: 86
  },
  {
    id: "qwen2.5-coder:7b",
    name: "Qwen 2.5 Coder 7B",
    displayName: "Qwen 2.5 Coder 7B",
    provider: "open_source",
    capabilities: ["chat", "code", "patching"],
    priority: 48,
    contextWindow: 32_000,
    supportsStreaming: true,
    supportsToolCalling: false,
    preferredIntents: ["fallback", "kilocode"],
    endpoint: OLLAMA_ENDPOINT,
    speed: "balanced",
    costEstimate: "local",
    latency: "medium",
    specialization: ["coding"],
    defaultScore: 52
  },
  {
    id: "llama3.1:8b",
    name: "Llama 3.1 8B",
    displayName: "Llama 3.1 8B",
    provider: "open_source",
    capabilities: ["chat", "code", "reasoning"],
    priority: 42,
    contextWindow: 128_000,
    supportsStreaming: true,
    supportsToolCalling: false,
    preferredIntents: ["fallback", "reasoning"],
    endpoint: OLLAMA_ENDPOINT,
    speed: "balanced",
    costEstimate: "local",
    latency: "medium",
    specialization: ["reasoning", "coding"],
    defaultScore: 48
  },
  {
    id: "llama3.1:70b",
    name: "Llama 3.1 70B",
    displayName: "Llama 3.1 70B Fallback",
    provider: "open_source",
    capabilities: ["chat", "code", "reasoning"],
    priority: 45,
    contextWindow: 128_000,
    supportsStreaming: true,
    supportsToolCalling: false,
    preferredIntents: ["fallback", "reasoning"],
    endpoint: OLLAMA_ENDPOINT,
    speed: "slow",
    costEstimate: "local",
    latency: "high",
    specialization: ["reasoning", "coding"],
    defaultScore: 55
  },
  {
    id: "qwen2.5-coder:32b",
    name: "Qwen 2.5 Coder 32B",
    displayName: "Qwen 2.5 Coder 32B Fallback",
    provider: "open_source",
    capabilities: ["chat", "code", "reasoning", "patching"],
    priority: 50,
    contextWindow: 128_000,
    supportsStreaming: true,
    supportsToolCalling: false,
    preferredIntents: ["fallback", "kilocode", "multi_file"],
    endpoint: OLLAMA_ENDPOINT,
    speed: "balanced",
    costEstimate: "local",
    latency: "medium",
    specialization: ["coding", "reasoning"],
    defaultScore: 60
  }
];

export const getModelProfile = (modelId: string): ModelProfile | undefined =>
  modelProfiles.find((profile) => profile.id === modelId);

export const getProviderProfiles = (provider: ModelProviderId): ModelProfile[] =>
  modelProfiles.filter((profile) => profile.provider === provider);

export const profileSupportsCapability = (profile: ModelProfile, capability: ModelCapability): boolean =>
  profile.capabilities.includes(capability);

export const profileSupportsIntent = (profile: ModelProfile, intent?: RoutingIntent): boolean =>
  !intent || profile.preferredIntents.includes(intent);
