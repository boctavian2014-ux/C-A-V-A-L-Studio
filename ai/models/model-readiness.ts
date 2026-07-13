import { isOllamaReachable, fetchInstalledOllamaModels } from './ollama-client';
import type { ModelSelectionId } from './model-catalog';
import { getModelProfile } from '../model-profiles';
import { MODELS, type ApiKeys } from '../multi-model/provider';
import { providerApiKeyEnv } from './provider-credentials';

export const BYOK_MODEL_IDS = [
  'claude-opus-4',
  'claude-sonnet-4',
  'gpt-4o',
  'gpt-4o-mini',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'ollama-local',
] as const;

export type ByokModelId = (typeof BYOK_MODEL_IDS)[number];

const BYOK_SET = new Set<string>(BYOK_MODEL_IDS);

const PROVIDER_KEY_HINTS: Record<string, string> = {
  poolside: 'Adaugă Poolside API Key în Panoul AI → 🔑 Chei API.',
  nvidia: 'Adaugă NVIDIA API Key în Panoul AI → 🔑 Chei API (build.nvidia.com).',
  north: 'Adaugă North API Key în Panoul AI → 🔑 Chei API.',
  openrouter: 'Adaugă OpenRouter API Key (sk-or-...) în Panoul AI → 🔑 Chei API.',
};

export function isByokModel(id: ModelSelectionId): boolean {
  return BYOK_SET.has(id);
}

export type ModelReadiness =
  | { ready: true; reason: string }
  | { ready: false; reason: string; hint: string };

function byokKeyForModel(modelId: string, apiKeys: ApiKeys): boolean {
  const meta = MODELS.find((m) => m.id === modelId);
  if (!meta) return false;
  switch (meta.provider) {
    case 'anthropic':
      return Boolean(apiKeys.anthropic?.trim());
    case 'openai':
      return Boolean(apiKeys.openai?.trim());
    case 'google':
      return Boolean(apiKeys.google?.trim());
    case 'ollama':
      return true;
    default:
      return false;
  }
}

export function hasOpenRouterKey(
  openRouterApiKey?: string | null,
  secrets?: Record<string, string>
): boolean {
  return Boolean(
    openRouterApiKey?.trim() ||
      secrets?.OPENROUTER_API_KEY?.trim() ||
      (typeof process !== 'undefined' && process.env?.OPENROUTER_API_KEY?.trim())
  );
}

export function hasProviderKey(
  provider: string,
  secrets?: Record<string, string>
): boolean {
  const envKey = providerApiKeyEnv(provider);
  if (!envKey) return true;
  return Boolean(
    secrets?.[envKey]?.trim() ||
      (typeof process !== 'undefined' && process.env?.[envKey]?.trim())
  );
}

export async function resolveSecretsFromClient(): Promise<Record<string, string>> {
  if (typeof window === 'undefined') return {};
  const w = window as {
    caval?: {
      secretsGet?: () => Promise<{ secrets?: Record<string, string> }>;
    };
  };
  const secretsRes = await w.caval?.secretsGet?.().catch(() => undefined);
  return { ...(secretsRes?.secrets ?? {}) };
}

export async function resolveOpenRouterKeyFromClient(): Promise<string | undefined> {
  const secrets = await resolveSecretsFromClient();
  return secrets.OPENROUTER_API_KEY?.trim();
}

function ollamaNameMatches(installed: string[], profileId: string): boolean {
  const base = profileId.split(':')[0];
  return installed.some(
    (name) => name === profileId || name.startsWith(`${base}:`) || name === base
  );
}

async function checkLocalModelReady(modelId: string): Promise<ModelReadiness> {
  const profile = getModelProfile(modelId);
  const reachable = await isOllamaReachable();
  if (!reachable) {
    return {
      ready: false,
      reason: 'Ollama nu rulează',
      hint: `Pornește Ollama pentru ${profile?.displayName ?? modelId}.`,
    };
  }
  const installed = await fetchInstalledOllamaModels();
  if (installed.length > 0 && !ollamaNameMatches(installed, modelId)) {
    return {
      ready: false,
      reason: `Modelul ${modelId} nu e instalat în Ollama`,
      hint: `Rulează: ollama pull ${modelId}`,
    };
  }
  return { ready: true, reason: 'Model local via Ollama' };
}

function checkProviderProfileReady(
  provider: string,
  secrets: Record<string, string>
): ModelReadiness {
  if (provider === 'openrouter') {
    if (hasOpenRouterKey(undefined, secrets)) {
      return { ready: true, reason: 'OpenRouter configurat' };
    }
    return {
      ready: false,
      reason: 'OpenRouter neconfigurat',
      hint: PROVIDER_KEY_HINTS.openrouter,
    };
  }
  if (hasProviderKey(provider, secrets)) {
    return { ready: true, reason: `Cheie ${provider} configurată` };
  }
  return {
    ready: false,
    reason: `Lipsește cheia ${provider}`,
    hint: PROVIDER_KEY_HINTS[provider] ?? 'Deschide Panoul AI → 🔑 Chei API.',
  };
}

export async function checkModelReadiness(
  modelId: ModelSelectionId,
  apiKeys: ApiKeys,
  options?: { openRouterApiKey?: string }
): Promise<ModelReadiness> {
  const secrets = await resolveSecretsFromClient();
  const mergedSecrets = {
    ...secrets,
    ...(apiKeys as Record<string, string>),
    ...(options?.openRouterApiKey
      ? { OPENROUTER_API_KEY: options.openRouterApiKey }
      : {}),
  };

  if (isByokModel(modelId)) {
    if (modelId === 'ollama-local') {
      return checkLocalModelReady('qwen2.5-coder:7b');
    }
    if (byokKeyForModel(modelId, apiKeys)) {
      return { ready: true, reason: 'Cheie BYOK configurată' };
    }
    const meta = MODELS.find((m) => m.id === modelId);
    return {
      ready: false,
      reason: `Lipsește cheia ${meta?.provider ?? 'provider'}`,
      hint: 'Deschide panoul AI → 🔑 API Keys și adaugă cheia furnizorului.',
    };
  }

  if (modelId === 'caval-auto/free') {
    const ollamaUp = await isOllamaReachable();
    if (ollamaUp) return { ready: true, reason: 'Auto Free via Ollama' };
    if (hasOpenRouterKey(undefined, mergedSecrets)) {
      return { ready: true, reason: 'Auto Free via OpenRouter fallback' };
    }
    return {
      ready: false,
      reason: 'Nici Ollama, nici OpenRouter',
      hint: 'Pornește Ollama (ollama pull qwen2.5-coder:7b) sau adaugă OpenRouter API Key.',
    };
  }

  if (modelId === 'caval-auto/balanced' || modelId === 'caval-auto/frontier') {
    if (hasOpenRouterKey(undefined, mergedSecrets)) {
      return { ready: true, reason: 'OpenRouter configurat' };
    }
    const ollamaUp = await isOllamaReachable();
    if (ollamaUp) return { ready: true, reason: 'Fallback local Ollama' };
    return {
      ready: false,
      reason: 'OpenRouter neconfigurat',
      hint: PROVIDER_KEY_HINTS.openrouter,
    };
  }

  if (modelId.startsWith('openrouter:')) {
    return checkProviderProfileReady('openrouter', mergedSecrets);
  }

  const profile = getModelProfile(modelId);
  if (profile) {
    if (profile.provider === 'open_source') {
      return checkLocalModelReady(modelId);
    }
    return checkProviderProfileReady(profile.provider, mergedSecrets);
  }

  if (hasOpenRouterKey(undefined, mergedSecrets)) {
    return { ready: true, reason: 'OpenRouter' };
  }

  return {
    ready: false,
    reason: 'Model necunoscut sau neconfigurat',
    hint: 'Schimbă modelul din dropdown-ul din panoul AI (▾ lângă Trimite).',
  };
}
