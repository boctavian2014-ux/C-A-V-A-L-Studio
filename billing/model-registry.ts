/**
 * Server-side model → entitlement tier map.
 * Does not enforce access; used by PlanLimits.allowedModelTiers later.
 * Keep separate from ai/models/model-catalog.ts (UI/BYOK).
 */

import type { MeteredProviderId, ModelTier } from "./subscription-types";

export interface RegistryModelEntry {
  id: string;
  provider: MeteredProviderId;
  tier: ModelTier;
  label: string;
}

/** Development catalog — extend via env docs, not hard-coded launch prices. */
export const MODEL_REGISTRY: readonly RegistryModelEntry[] = [
  // Anthropic
  { id: "claude-haiku-4-5", provider: "anthropic", tier: "fast", label: "Claude Haiku 4.5" },
  { id: "claude-sonnet-5", provider: "anthropic", tier: "standard", label: "Claude Sonnet 5" },
  { id: "claude-opus-5", provider: "anthropic", tier: "ultra", label: "Claude Opus 5" },
  { id: "claude-fable-5-1", provider: "anthropic", tier: "ultra", label: "Claude Fable 5.1" },
  // OpenAI
  { id: "gpt-4o-mini", provider: "openai", tier: "fast", label: "GPT-4o mini" },
  { id: "gpt-4.1-mini", provider: "openai", tier: "fast", label: "GPT-4.1 mini" },
  { id: "gpt-4o", provider: "openai", tier: "standard", label: "GPT-4o" },
  { id: "gpt-4.1", provider: "openai", tier: "standard", label: "GPT-4.1" },
  { id: "o3", provider: "openai", tier: "ultra", label: "o3" },
  // StepFun
  { id: "stepfun-step-3-7-flash", provider: "stepfun", tier: "fast", label: "StepFun Step 3.7 Flash" },
  { id: "stepfun-step-2", provider: "stepfun", tier: "standard", label: "StepFun Step 2" },
  // NVIDIA
  { id: "nvidia-nemotron-nano", provider: "nvidia", tier: "fast", label: "NVIDIA Nemotron Nano" },
  { id: "nvidia-nemotron-super", provider: "nvidia", tier: "standard", label: "NVIDIA Nemotron Super" },
  { id: "nvidia-nemotron-ultra", provider: "nvidia", tier: "ultra", label: "NVIDIA Nemotron Ultra" },
  // OpenRouter aliases (managed vault routes)
  { id: "openrouter/auto", provider: "openrouter", tier: "standard", label: "OpenRouter Auto" },
  { id: "openrouter/free", provider: "openrouter", tier: "fast", label: "OpenRouter Free" },
  // CAD providers (budget tiers — Zoo is cost-sensitive → ultra)
  { id: "zoo-text-to-cad", provider: "zoo", tier: "ultra", label: "Zoo Text-to-CAD" },
  { id: "piapi-trellis", provider: "piapi", tier: "standard", label: "PiAPI Trellis" },
  { id: "meshy-text-to-3d", provider: "meshy", tier: "standard", label: "Meshy Text-to-3D" },
] as const;

const BY_ID = new Map(MODEL_REGISTRY.map((m) => [m.id.toLowerCase(), m]));

export function getModelEntry(modelId: string): RegistryModelEntry | undefined {
  return BY_ID.get(modelId.trim().toLowerCase());
}

export function resolveModelTier(modelId: string): ModelTier | null {
  return getModelEntry(modelId)?.tier ?? null;
}

export function listModelsForTier(tier: ModelTier): RegistryModelEntry[] {
  return MODEL_REGISTRY.filter((m) => m.tier === tier);
}

export function listModelsForProvider(provider: MeteredProviderId): RegistryModelEntry[] {
  return MODEL_REGISTRY.filter((m) => m.provider === provider);
}

/** Env names that must stay server-side (Railway / KMS). Never expose values to renderer. */
export const MANAGED_PROVIDER_ENV_KEYS = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENROUTER_API_KEY",
  "NVIDIA_API_KEY",
  "ZOO_API_TOKEN",
  "PIAPI_API_KEY",
  "MESHY_API_KEY",
  "STEPFUN_API_KEY",
] as const;

export type ManagedProviderEnvKey = (typeof MANAGED_PROVIDER_ENV_KEYS)[number];

export function managedProviderEnvConfigured(
  env: NodeJS.ProcessEnv = process.env
): Record<ManagedProviderEnvKey, boolean> {
  const out = {} as Record<ManagedProviderEnvKey, boolean>;
  for (const key of MANAGED_PROVIDER_ENV_KEYS) {
    out[key] = Boolean(env[key]?.trim());
  }
  return out;
}
