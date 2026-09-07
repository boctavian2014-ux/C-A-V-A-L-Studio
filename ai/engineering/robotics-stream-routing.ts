/**
 * Robotics live-stream latency budget routing.
 *
 * Rule:
 * - live stream  → fast model (when Auto *), compact prompt, light intent
 * - deep / complete → user model, ULTRA prompt, deep_thinking
 *
 * Watchdog timeouts are not a substitute for TTFT SLO on user-facing streams.
 */

import { FAST_CHAT_MODEL_ID } from '../models/auto-router';
import type { ModelSelectionId } from '../models/model-catalog';
import { isAutoTier } from '../models/model-catalog';
import type { RoutingIntent } from '../types';
import {
  ROBOTICS_AI_ULTRA_SYSTEM_PROMPT,
  ROBOTICS_AI_ULTRA_RETRY_SUFFIX,
} from '../prompts/robotics-ai-ultra';
import {
  ROBOTICS_AI_STREAM_COMPACT_SYSTEM_PROMPT,
  ROBOTICS_LIVE_STREAM_MAX_TOKENS,
} from '../prompts/robotics-ai-stream-compact';

export type RoboticsPromptProfile = 'compact' | 'ultra';

export type RoboticsStreamRoute = {
  modelId: ModelSelectionId;
  systemPrompt: string;
  intent: RoutingIntent;
  promptProfile: RoboticsPromptProfile;
  maxTokens: number;
  /** True when we remapped Auto * → fast chat for TTFT. */
  remappedFromAuto: boolean;
};

/** Live stream: prefer TTFT + short output over depth. */
export function resolveRoboticsLiveStreamRoute(
  selectedModel: ModelSelectionId
): RoboticsStreamRoute {
  const remappedFromAuto = isAutoTier(selectedModel);
  return {
    modelId: remappedFromAuto
      ? (FAST_CHAT_MODEL_ID as ModelSelectionId)
      : selectedModel,
    systemPrompt: ROBOTICS_AI_STREAM_COMPACT_SYSTEM_PROMPT,
    intent: 'planning',
    promptProfile: 'compact',
    maxTokens: ROBOTICS_LIVE_STREAM_MAX_TOKENS,
    remappedFromAuto,
  };
}

/** Non-stream / deep-answer: full ULTRA + caller model. */
export function resolveRoboticsDeepCompleteRoute(
  selectedModel: ModelSelectionId
): RoboticsStreamRoute {
  return {
    modelId: selectedModel,
    systemPrompt: ROBOTICS_AI_ULTRA_SYSTEM_PROMPT,
    intent: 'deep_thinking',
    promptProfile: 'ultra',
    maxTokens: 16_384,
    remappedFromAuto: false,
  };
}

export function roboticsRetryUserSuffix(profile: RoboticsPromptProfile): string {
  return profile === 'ultra'
    ? ROBOTICS_AI_ULTRA_RETRY_SUFFIX
    : '\n\nIMPORTANT: Finish ONLY the 5 live sections (Summary, CAD, STL, Component List, Assembly). Max 3 bullets each. End with [END ROBOTICS]. No OpenSCAD.';
}

export function describeRoboticsStreamRoute(route: RoboticsStreamRoute, selected: ModelSelectionId): string {
  return `[robotics] live-stream route model=${route.modelId} prompt=${route.promptProfile} intent=${route.intent} maxTokens=${route.maxTokens}${
    route.remappedFromAuto ? ` (from ${selected})` : ''
  }`;
}
