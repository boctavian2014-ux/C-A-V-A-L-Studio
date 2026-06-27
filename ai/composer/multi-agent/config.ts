import fs from 'node:fs';
import path from 'node:path';

import type { MultiAgentConfig } from './types';
import { DEFAULT_MULTI_AGENT_CONFIG } from './types';

const PARTIAL_RUN_PATTERNS = [
  /\/quick\b/i,
  /\bdoar fix\b/i,
  /\bun singur fi[sș]ier\b/i,
  /\bf[aă]r[aă] pipeline\b/i,
  /\bpartial run\b/i,
  /\bquick fix\b/i,
];

export function isPartialRunRequest(message: string): boolean {
  return PARTIAL_RUN_PATTERNS.some((re) => re.test(message));
}

function stripJsoncComments(raw: string): string {
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

export function loadMultiAgentConfig(workspaceRoot?: string): MultiAgentConfig {
  const roots = [
    workspaceRoot,
    process.cwd(),
  ].filter(Boolean) as string[];

  for (const root of roots) {
    const configPath = path.join(root, 'caval.jsonc');
    try {
      if (!fs.existsSync(configPath)) continue;
      const raw = fs.readFileSync(configPath, 'utf8');
      const parsed = JSON.parse(stripJsoncComments(raw)) as {
        multiAgent?: Partial<MultiAgentConfig> & {
          reasoningLayer?: Partial<import('./types').ReasoningLayerConfig>;
        };
      };
      if (parsed.multiAgent) {
        const cfg = parsed.multiAgent;
        return {
          ...DEFAULT_MULTI_AGENT_CONFIG,
          ...cfg,
          reasoningLayer: {
            ...DEFAULT_MULTI_AGENT_CONFIG.reasoningLayer,
            ...cfg.reasoningLayer,
          },
        };
      }
    } catch {
      // fall through
    }
  }

  return { ...DEFAULT_MULTI_AGENT_CONFIG };
}

export function loadReasoningConfig(workspaceRoot?: string) {
  return loadMultiAgentConfig(workspaceRoot).reasoningLayer;
}

export function shouldUseMultiAgentPipeline(
  mode: string | undefined,
  message: string,
  workspaceRoot: string | undefined,
  config?: MultiAgentConfig
): boolean {
  if (mode !== 'code') return false;
  if (!workspaceRoot) return false;
  const cfg = config ?? loadMultiAgentConfig(workspaceRoot);
  if (!cfg.enabled) return false;
  if (isPartialRunRequest(message)) return false;
  return true;
}
