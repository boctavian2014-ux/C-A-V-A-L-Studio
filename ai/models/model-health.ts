import { modelProfiles } from '../model-profiles';
import { fetchInstalledOllamaModels, isOllamaReachable } from './ollama-client';
import { hasOpenRouterKey, hasProviderKey } from './model-readiness';
import { providerApiKeyEnv } from './provider-credentials';

export type ModelHealthStatus = 'ready' | 'missing_key' | 'not_installed' | 'ollama_down' | 'unknown';

export interface ProviderHealth {
  ok: boolean;
  error?: string;
  installed?: string[];
}

export interface ModelsHealthSnapshot {
  ok: boolean;
  providers: {
    openrouter: ProviderHealth;
    poolside: ProviderHealth;
    nvidia: ProviderHealth;
    north: ProviderHealth;
    ollama: ProviderHealth;
  };
  models: Record<string, ModelHealthStatus>;
  summary: string;
}

function ollamaNameMatches(installed: string[], profileId: string): boolean {
  const base = profileId.split(':')[0];
  return installed.some(
    (name) => name === profileId || name.startsWith(`${base}:`) || name === base
  );
}

async function pingOpenRouter(): Promise<ProviderHealth> {
  const key =
    typeof process !== 'undefined' ? process.env.OPENROUTER_API_KEY?.trim() : undefined;
  if (!key) {
    return { ok: false, error: 'Cheie lipsă' };
  }
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function providerHealthFromEnv(provider: string): ProviderHealth {
  const envKey = providerApiKeyEnv(provider);
  if (!envKey) return { ok: true };
  if (hasProviderKey(provider)) return { ok: true };
  return { ok: false, error: 'Cheie lipsă' };
}

export async function buildModelsHealthSnapshot(): Promise<ModelsHealthSnapshot> {
  const ollamaReachable = await isOllamaReachable();
  const installed = ollamaReachable ? await fetchInstalledOllamaModels() : [];

  const openrouter = hasOpenRouterKey()
    ? await pingOpenRouter()
    : { ok: false, error: 'Cheie lipsă' };

  const providers = {
    openrouter,
    poolside: providerHealthFromEnv('poolside'),
    nvidia: providerHealthFromEnv('nvidia'),
    north: providerHealthFromEnv('north'),
    ollama: {
      ok: ollamaReachable,
      installed,
      error: ollamaReachable ? undefined : 'Ollama nu răspunde',
    },
  };

  const models: Record<string, ModelHealthStatus> = {};

  for (const profile of modelProfiles) {
    if (profile.provider === 'open_source') {
      if (!ollamaReachable) {
        models[profile.id] = 'ollama_down';
      } else if (installed.length > 0 && !ollamaNameMatches(installed, profile.id)) {
        models[profile.id] = 'not_installed';
      } else {
        models[profile.id] = 'ready';
      }
      continue;
    }

    const providerHealth = providers[profile.provider as keyof typeof providers];
    if (providerHealth && 'ok' in providerHealth && providerHealth.ok) {
      models[profile.id] = 'ready';
    } else {
      models[profile.id] = 'missing_key';
    }
  }

  const readyCount = Object.values(models).filter((s) => s === 'ready').length;
  const total = modelProfiles.length;
  const lines = [
    `Modele CAVALLO: ${readyCount}/${total} pregătite`,
    `OpenRouter: ${providers.openrouter.ok ? 'OK' : providers.openrouter.error ?? '—'}`,
    `Poolside: ${providers.poolside.ok ? 'OK' : 'cheie lipsă'}`,
    `NVIDIA: ${providers.nvidia.ok ? 'OK' : 'cheie lipsă'}`,
    `North: ${providers.north.ok ? 'OK' : 'cheie lipsă'}`,
    `Ollama: ${providers.ollama.ok ? `${installed.length} modele` : 'offline'}`,
  ];

  return {
    ok: readyCount > 0,
    providers,
    models,
    summary: lines.join('\n'),
  };
}

export function modelHealthLabel(status: ModelHealthStatus): string {
  switch (status) {
    case 'ready':
      return 'Gata';
    case 'missing_key':
      return 'Cheie lipsă';
    case 'not_installed':
      return 'Nepullat în Ollama';
    case 'ollama_down':
      return 'Ollama offline';
    default:
      return 'Necunoscut';
  }
}

export function modelHealthColor(status: ModelHealthStatus): string {
  switch (status) {
    case 'ready':
      return '#2FBF71';
    case 'missing_key':
    case 'not_installed':
    case 'ollama_down':
      return '#F59E0B';
    default:
      return '#8A95A6';
  }
}
