import {
  DEFAULT_CAVAL_CONFIG,
  type AgentModeId,
  type CavalConfig,
} from '../modes/agent-modes';
import type { ModelSelectionId } from '../models/model-catalog';
import { hasProviderCredentials } from '../models/provider-credentials';

export function stripJsonc(raw: string): string {
  return raw.replace(/\/\/.*$/gm, '').replace(/,\s*}/g, '}');
}

export function mergeCavalConfig(parsed: Partial<CavalConfig>): CavalConfig {
  return {
    ...DEFAULT_CAVAL_CONFIG,
    ...parsed,
    models: { ...DEFAULT_CAVAL_CONFIG.models, ...parsed.models },
    cavalloModes: { ...DEFAULT_CAVAL_CONFIG.cavalloModes, ...parsed.cavalloModes },
    autocomplete: { ...DEFAULT_CAVAL_CONFIG.autocomplete, ...parsed.autocomplete },
    mcp: parsed.mcp ?? DEFAULT_CAVAL_CONFIG.mcp,
  };
}

export function resolveModelForMode(
  mode: AgentModeId,
  config: CavalConfig = DEFAULT_CAVAL_CONFIG
): ModelSelectionId {
  const perMode = config.models?.perMode;
  const fromConfig = perMode?.[mode] ?? perMode?.[mode === 'plan' ? 'architect' : mode];
  return fromConfig ?? config.models?.default ?? DEFAULT_CAVAL_CONFIG.models!.default!;
}

export function resolveAutocompleteModel(config: CavalConfig = DEFAULT_CAVAL_CONFIG): string {
  const preferred = config.autocomplete?.model ?? 'north-mini-code';
  if (preferred === 'north-mini-code' && !hasProviderCredentials('north')) {
    return 'qwen2.5-coder:7b';
  }
  return preferred;
}

export async function loadCavalConfigFromClient(
  projectPath?: string | null
): Promise<CavalConfig> {
  if (!projectPath?.trim() || typeof window === 'undefined') {
    return DEFAULT_CAVAL_CONFIG;
  }
  const sep = projectPath.includes('\\') ? '\\' : '/';
  const configPath = `${projectPath}${sep}caval.jsonc`;
  try {
    const res = await window.caval?.fs?.readFile?.(configPath);
    if (!res?.ok || !res.content) return DEFAULT_CAVAL_CONFIG;
    const parsed = JSON.parse(stripJsonc(res.content)) as Partial<CavalConfig>;
    return mergeCavalConfig(parsed);
  } catch {
    return DEFAULT_CAVAL_CONFIG;
  }
}
