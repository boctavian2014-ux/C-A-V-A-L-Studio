import { isOllamaReachable } from './ollama-client';
import type { ModelSelectionId } from './model-catalog';
import { isAutoTier } from './model-catalog';
import { getModelProfile } from '../model-profiles';
import { MODELS, type ApiKeys } from '../multi-model/provider';

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

export async function resolveOpenRouterKeyFromClient(): Promise<string | undefined> {
  if (typeof window === 'undefined') return undefined;
  const w = window as {
    caval?: {
      settingsLoad?: () => Promise<{ settings?: Record<string, string> }>;
      secretsGet?: () => Promise<{ secrets?: Record<string, string> }>;
    };
  };
  const [settingsRes, secretsRes] = await Promise.all([
    w.caval?.settingsLoad?.().catch(() => undefined),
    w.caval?.secretsGet?.().catch(() => undefined),
  ]);
  return (
    settingsRes?.settings?.['openrouter.apiKey']?.trim() ||
    secretsRes?.secrets?.OPENROUTER_API_KEY?.trim()
  );
}

export async function checkModelReadiness(
  modelId: ModelSelectionId,
  apiKeys: ApiKeys,
  options?: { openRouterApiKey?: string }
): Promise<ModelReadiness> {
  const openRouterKey =
    options?.openRouterApiKey ??
    (await resolveOpenRouterKeyFromClient()) ??
    (apiKeys as Record<string, string>).OPENROUTER_API_KEY;
  if (isByokModel(modelId)) {
    if (modelId === 'ollama-local') {
      const reachable = await isOllamaReachable();
      if (!reachable) {
        return {
          ready: false,
          reason: 'Ollama nu rulează',
          hint: 'Pornește Ollama (ollama serve) și selectează ollama-local sau Auto Free în panoul AI.',
        };
      }
      return { ready: true, reason: 'Ollama local' };
    }
    if (byokKeyForModel(modelId, apiKeys)) {
      return { ready: true, reason: 'Cheie BYOK configurată' };
    }
    const meta = MODELS.find((m) => m.id === modelId);
    return {
      ready: false,
      reason: `Lipsește cheia ${meta?.provider ?? 'provider'}`,
      hint: 'Deschide panoul AI → 🔑 API Keys și adaugă cheia furnizorului, sau alege Auto Free / Free OpenRouter.',
    };
  }

  if (modelId === 'caval-auto/free') {
    const reachable = await isOllamaReachable();
    if (!reachable) {
      return {
        ready: false,
        reason: 'Ollama nu rulează',
        hint: 'Instalează Ollama, rulează ollama pull qwen2.5-coder:7b, apoi selectează Auto Free în chat.',
      };
    }
    return { ready: true, reason: 'Auto Free via Ollama' };
  }

  if (modelId.startsWith('openrouter:') || isAutoTier(modelId)) {
    if (hasOpenRouterKey(openRouterKey, apiKeys as Record<string, string>)) {
      return { ready: true, reason: 'OpenRouter configurat' };
    }
    const profile = getModelProfile(modelId);
    if (profile?.provider === 'open_source') {
      const reachable = await isOllamaReachable();
      if (reachable) return { ready: true, reason: 'Model local via Ollama' };
    }
    const orHint =
      modelId.includes('anthropic/') || modelId.includes('claude')
        ? 'Panoul AI → 🔑 → OpenRouter (sk-or-...). Alternativ: alege „Claude Sonnet” (BYOK) + cheie Anthropic (sk-ant-...).'
        : 'Panoul AI → 🔑 → OpenRouter API Key (sk-or-...), sau folosește Auto Free cu Ollama.';
    return {
      ready: false,
      reason: 'OpenRouter neconfigurat',
      hint: orHint,
    };
  }

  const profile = getModelProfile(modelId);
  if (profile) {
    if (profile.provider === 'open_source') {
      const reachable = await isOllamaReachable();
      if (!reachable) {
        return {
          ready: false,
          reason: 'Ollama nu rulează',
          hint: `Pornește Ollama pentru modelul ${profile.displayName}.`,
        };
      }
      return { ready: true, reason: 'Model local' };
    }
    if (hasOpenRouterKey(openRouterKey, apiKeys as Record<string, string>)) {
      return { ready: true, reason: 'OpenRouter / cloud router' };
    }
    return {
      ready: false,
      reason: 'Cheie cloud lipsă',
      hint: 'Adaugă OpenRouter API Key în panoul AI (🔑) sau alege Auto Free.',
    };
  }

  if (hasOpenRouterKey(openRouterKey, apiKeys as Record<string, string>)) {
    return { ready: true, reason: 'OpenRouter' };
  }

  return {
    ready: false,
    reason: 'Model necunoscut sau neconfigurat',
    hint: 'Schimbă modelul din dropdown-ul din panoul AI (▾ lângă Trimite).',
  };
}
