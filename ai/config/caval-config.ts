import fs from 'node:fs/promises';
import path from 'node:path';
import type { CavalConfig } from '../modes/agent-modes';
import { DEFAULT_CAVAL_CONFIG } from '../modes/agent-modes';
import { mergeCavalConfig, stripJsonc } from './caval-config-shared';

export async function loadCavalConfig(workspaceRoot?: string | null): Promise<CavalConfig> {
  if (!workspaceRoot?.trim()) {
    return DEFAULT_CAVAL_CONFIG;
  }
  try {
    const configPath = path.join(workspaceRoot, 'caval.jsonc');
    const raw = await fs.readFile(configPath, 'utf8');
    const parsed = JSON.parse(stripJsonc(raw)) as Partial<CavalConfig>;
    return mergeCavalConfig(parsed);
  } catch {
    return DEFAULT_CAVAL_CONFIG;
  }
}

export {
  loadCavalConfigFromClient,
  mergeCavalConfig,
  resolveAutocompleteModel,
  resolveModelForMode,
  stripJsonc,
} from './caval-config-shared';
