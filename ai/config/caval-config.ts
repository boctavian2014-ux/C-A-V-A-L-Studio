import path from 'node:path';
import fs from 'node:fs/promises';

import type { CavalConfig } from '../modes/agent-modes';
import { DEFAULT_CAVAL_CONFIG } from '../modes/agent-modes';
import { mergeCavalConfig, stripJsonc } from './caval-config-shared';

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
  } catch {
    return null;
  }
}

/** Load caval.jsonc for workspace, or fallback paths (cwd, app path). */
export async function loadCavalConfig(workspaceRoot?: string | null): Promise<CavalConfig> {
  for (const configPath of resolveCavalConfigSearchPaths(workspaceRoot)) {
    const config = await readCavalJsoncAt(configPath);
    if (config) return config;
  }
  return DEFAULT_CAVAL_CONFIG;
}

export {
  loadCavalConfigFromClient,
  mergeCavalConfig,
  resolveAutocompleteModel,
  resolveModelForMode,
  stripJsonc,
} from './caval-config-shared';
