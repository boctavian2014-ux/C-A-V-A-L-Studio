import fs from 'node:fs';
import path from 'node:path';

import {
  DEFAULT_ZERO_LATENCY_CONFIG,
  type ZeroLatencyConfig,
} from './zl-config-shared';

export type { ZeroLatencyConfig, ZeroLatencyDraftPlanMode } from './zl-config-shared';
export { DEFAULT_ZERO_LATENCY_CONFIG, isFrontierSelection } from './zl-config-shared';

function stripJsoncComments(raw: string): string {
  return raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

export function loadZeroLatencyConfig(workspaceRoot?: string): ZeroLatencyConfig {
  const roots = [workspaceRoot, process.cwd()].filter(Boolean) as string[];

  for (const root of roots) {
    const configPath = path.join(root, 'caval.jsonc');
    try {
      if (!fs.existsSync(configPath)) continue;
      const raw = fs.readFileSync(configPath, 'utf8');
      const parsed = JSON.parse(stripJsoncComments(raw)) as {
        zeroLatency?: Partial<ZeroLatencyConfig>;
      };
      if (parsed.zeroLatency) {
        return { ...DEFAULT_ZERO_LATENCY_CONFIG, ...parsed.zeroLatency };
      }
    } catch {
      // fall through
    }
  }

  return { ...DEFAULT_ZERO_LATENCY_CONFIG };
}
