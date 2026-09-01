import path from 'node:path';
import fs from 'node:fs/promises';

import type { CavalConfig } from '../modes/agent-modes';
import { mergeCavalConfig, stripJsonc } from './caval-config-shared';
import { FallbackChainConfigError } from './model-fallback-chain';

let extraSearchPaths: string[] = [];

/** Main process: add app.getAppPath() so caval.jsonc resolves when cwd differs. */
export function setCavalConfigExtraPaths(paths: string[]): void {
  extraSearchPaths = paths.filter(Boolean);
}

export function resolveCavalConfigSearchPaths(workspaceRoot?: string | null): string[] {
  const candidates: string[] = [];
  if (workspaceRoot?.trim()) {
    candidates.push(path.join(workspaceRoot, 'caval.jsonc'));
  }
  candidates.push(path.join(process.cwd(), 'caval.jsonc'));
  for (const dir of extraSearchPaths) {
    if (dir?.trim()) candidates.push(path.join(dir, 'caval.jsonc'));
  }
  return [...new Set(candidates)];
}

async function readCavalJsoncAt(configPath: string): Promise<CavalConfig | null> {
  try {
    const raw = await fs.readFile(configPath, 'utf8');
    const parsed = JSON.parse(stripJsonc(raw)) as Partial<CavalConfig>;
    return mergeCavalConfig(parsed);
  } catch (error) {
    if (error instanceof FallbackChainConfigError) {
      throw error;
    }
    return null;
  }
}

/** Load caval.jsonc for workspace, or fallback paths (cwd, app path). */
export async function loadCavalConfig(workspaceRoot?: string | null): Promise<CavalConfig> {
  for (const configPath of resolveCavalConfigSearchPaths(workspaceRoot)) {
    const config = await readCavalJsoncAt(configPath);
    if (config) return config;
  }
  return mergeCavalConfig({});
}

/** Boot: load + validate fallback chains (throws FallbackChainConfigError). */
export async function validateCavalConfigOnBoot(workspaceRoot?: string | null): Promise<CavalConfig> {
  return loadCavalConfig(workspaceRoot);
}

export {
  loadCavalConfigFromClient,
  mergeCavalConfig,
  resolveAutocompleteModel,
  resolveModelForMode,
  stripJsonc,
} from './caval-config-shared';
export { FallbackChainConfigError, DEFAULT_MODEL_FALLBACK } from './model-fallback-chain';
