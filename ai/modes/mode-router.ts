/**
 * CAVALLO mode router — resolves effective mode and system prompt for direct chat.
 * Agentic mode bypasses this module entirely.
 */
import type { AgentModeId } from './agent-modes';
import { isAgenticPipelineMode, isBuildEngineMode, isReleaseEngineerMode } from './agent-modes';
import {
  detectIntent,
  isDirectChatMode,
  normalizeAgentModeId,
  type DirectChatModeId,
} from './intent-detector';
import {
  getCavalloEnterprisePrompt,
  CAVALLO_GLOBAL_RULES,
} from '../prompts/cavallo-enterprise-modes';
import { SCAFFOLD_EMISSION_RULE } from '../prompts/scaffold-emission-rule';
import { CAVALO_BUILD_ENGINE_PROMPT } from '../prompts/cavalo-build-engine';
import { CAVALO_RELEASE_ENGINEER_PROMPT } from '../prompts/cavalo-release-engineer';

const BUILD_MODE_EXPLICIT = /\b(?:BUILD\s+MODE|mod\s+build)\b/i;
const RELEASE_MODE_EXPLICIT = /\b(?:RELEASE\s+MODE|mod\s+release|release\s+engineer)\b/i;

export interface CavalloModesConfig {
  autoModeSwitch?: boolean;
  explicitTriggers?: boolean;
}

export const DEFAULT_CAVALLO_MODES_CONFIG: CavalloModesConfig = {
  autoModeSwitch: true,
  explicitTriggers: true,
};

export interface ModeResolution {
  mode: AgentModeId;
  switched: boolean;
  switchReason?: string;
  fromMode?: AgentModeId;
}

export interface ResolveEffectiveModeOptions {
  autoSwitch?: boolean;
  explicitTriggers?: boolean;
  /** Only auto-switch when confidence is high (respects manual UI selection). */
  requireHighConfidence?: boolean;
}

/** Resolve mode from current selection + user message. Never changes agentic. */
export function resolveEffectiveMode(
  currentMode: string,
  message: string,
  options?: ResolveEffectiveModeOptions
): ModeResolution {
  const normalized = normalizeAgentModeId(currentMode);

  if (isAgenticPipelineMode(normalized)) {
    return { mode: 'agentic', switched: false };
  }

  if (options?.explicitTriggers !== false && RELEASE_MODE_EXPLICIT.test(message)) {
    return {
      mode: 'release',
      switched: normalized !== 'release',
      switchReason: 'explicit release trigger',
      fromMode: normalized !== 'release' ? normalized : undefined,
    };
  }

  if (options?.explicitTriggers !== false && BUILD_MODE_EXPLICIT.test(message)) {
    return {
      mode: 'build',
      switched: normalized !== 'build',
      switchReason: 'explicit build trigger',
      fromMode: normalized !== 'build' ? normalized : undefined,
    };
  }

  if (isBuildEngineMode(normalized)) {
    return { mode: 'build', switched: false };
  }

  if (isReleaseEngineerMode(normalized)) {
    return { mode: 'release', switched: false };
  }

  const autoSwitch = options?.autoSwitch !== false;
  if (!autoSwitch) {
    return { mode: normalized, switched: false };
  }

  const detection = detectIntent(message, {
    explicitTriggers: options?.explicitTriggers !== false,
  });

  const requireHigh = options?.requireHighConfidence !== false;
  if (requireHigh && detection.confidence !== 'high') {
    return { mode: normalized, switched: false };
  }

  if (detection.mode === normalized) {
    return { mode: normalized, switched: false };
  }

  return {
    mode: detection.mode,
    switched: true,
    switchReason: detection.reason,
    fromMode: normalized,
  };
}

/** Build strict CAVALLO system prompt for direct modes. Agentic uses CODING_ARENA separately. */
export function getCavalloSystemPrompt(
  mode: string,
  opts?: { includeScaffold?: boolean; workspaceRoot?: string }
): string {
  const normalized = normalizeAgentModeId(mode);

  if (isAgenticPipelineMode(normalized)) {
    return '';
  }

  if (isReleaseEngineerMode(normalized)) {
    let prompt = CAVALO_RELEASE_ENGINEER_PROMPT;
    if (opts?.workspaceRoot?.trim()) {
      prompt += `\n\nWorkspace root: ${opts.workspaceRoot.trim()}`;
    }
    return prompt;
  }

  if (isBuildEngineMode(normalized)) {
    let prompt = CAVALO_BUILD_ENGINE_PROMPT;
    if (opts?.includeScaffold !== false) {
      prompt += `\n\n${SCAFFOLD_EMISSION_RULE}`;
    }
    if (opts?.workspaceRoot?.trim()) {
      prompt += `\n\nWorkspace root: ${opts.workspaceRoot.trim()}`;
    }
    return prompt;
  }

  if (!isDirectChatMode(normalized)) {
    return getCavalloEnterprisePrompt('ask');
  }

  let prompt = getCavalloEnterprisePrompt(normalized);

  if (normalized === 'code' && opts?.includeScaffold !== false) {
    prompt += `\n\n${SCAFFOLD_EMISSION_RULE}`;
  }

  if (normalized === 'debug' && opts?.includeScaffold !== false) {
    prompt += `\n\nWhen applying fixes to workspace files, use \`\`\`lang:relative/path\`\`\` with full file content.\n${SCAFFOLD_EMISSION_RULE}`;
  }

  if (opts?.workspaceRoot?.trim()) {
    prompt += `\n\nWorkspace root: ${opts.workspaceRoot.trim()}`;
  }

  return prompt;
}

export function getModeLabel(mode: DirectChatModeId | 'build' | 'release'): string {
  switch (mode) {
    case 'plan':
      return 'Plan';
    case 'code':
      return 'Code';
    case 'build':
      return 'Build';
    case 'release':
      return 'Release';
    case 'ask':
      return 'Ask';
    case 'debug':
      return 'Debug';
  }
}

export { CAVALLO_GLOBAL_RULES };
