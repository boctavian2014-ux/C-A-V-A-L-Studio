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
          fullDelivery?: Partial<import('./types').FullDeliveryConfig>;
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
          fullDelivery: {
            ...DEFAULT_MULTI_AGENT_CONFIG.fullDelivery,
            ...cfg.fullDelivery,
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

/** UI "Review strict" forces full merge + supervisor (disables fastPipeline). */
export function applyMultiAgentOverrides(
  config: MultiAgentConfig,
  overrides?: { strictReview?: boolean; message?: string }
): MultiAgentConfig {
  let next = config;
  if (overrides?.strictReview) {
    next = { ...next, fastPipeline: false };
  }
  if (overrides?.message) {
    next = applyComplexPromptOverrides(next, overrides.message);
  }
  return next;
}

/** Long multi-module prompts get full pipeline + context synthesis. */
export function applyComplexPromptOverrides(
  config: MultiAgentConfig,
  message: string
): MultiAgentConfig {
  const lines = message.split('\n').filter((l) => l.trim()).length;
  const isComplex =
    message.length > 600 ||
    lines >= 8 ||
    (/\b(module|frontend|backend|dashboard|scraper|api|docker|deploy|forexebug|seap)\b/i.test(message) &&
      lines >= 4);
  if (!isComplex) return config;
  return {
    ...config,
    fastPipeline: false,
    skipContextLlm: false,
    antiCollapseDecomposition: true,
    decompositionMaxTokens: Math.max(config.decompositionMaxTokens, 8192),
    fullDelivery: {
      ...config.fullDelivery,
      maxComposeWaves: Math.max(config.fullDelivery.maxComposeWaves, 4),
      minFencesAbsolute: Math.max(config.fullDelivery.minFencesAbsolute, 6),
    },
  };
}

export function shouldUseMultiAgentPipeline(
  mode: string | undefined,
  message: string,
  workspaceRoot: string | undefined,
  config?: MultiAgentConfig
): boolean {
  if (mode !== 'agentic') return false;
  if (!workspaceRoot) return false;
  const cfg = config ?? loadMultiAgentConfig(workspaceRoot);
  if (!cfg.enabled) return false;
  if (isPartialRunRequest(message)) return false;
  return true;
}
