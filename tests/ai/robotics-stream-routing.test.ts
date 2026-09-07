import { describe, expect, it } from 'vitest';

import { FAST_CHAT_MODEL_ID } from '../../ai/models/auto-router';
import {
  resolveRoboticsDeepCompleteRoute,
  resolveRoboticsLiveStreamRoute,
} from '../../ai/engineering/robotics-stream-routing';
import {
  ROBOTICS_AI_STREAM_COMPACT_SYSTEM_PROMPT,
  ROBOTICS_AI_STREAM_LIVE_HEADINGS,
  ROBOTICS_LIVE_STREAM_MAX_TOKENS,
} from '../../ai/prompts/robotics-ai-stream-compact';
import { ROBOTICS_AI_ULTRA_SYSTEM_PROMPT } from '../../ai/prompts/robotics-ai-ultra';
import { requiredRoboticsSections } from '../../ai/engineering/robotics-format';

describe('robotics stream routing', () => {
  it('maps Auto Frontier live stream to fast model + compact prompt', () => {
    const route = resolveRoboticsLiveStreamRoute('caval-auto/frontier');
    expect(route.modelId).toBe(FAST_CHAT_MODEL_ID);
    expect(route.promptProfile).toBe('compact');
    expect(route.intent).toBe('planning');
    expect(route.maxTokens).toBe(ROBOTICS_LIVE_STREAM_MAX_TOKENS);
    expect(route.remappedFromAuto).toBe(true);
    expect(route.systemPrompt).toBe(ROBOTICS_AI_STREAM_COMPACT_SYSTEM_PROMPT);
    expect(route.systemPrompt.length).toBeLessThan(ROBOTICS_AI_ULTRA_SYSTEM_PROMPT.length / 2);
  });

  it('live compact asks for at most 5 sections, covering required keys', () => {
    expect(ROBOTICS_AI_STREAM_LIVE_HEADINGS.length).toBeLessThanOrEqual(5);
    expect(ROBOTICS_AI_STREAM_LIVE_HEADINGS.length).toBeGreaterThanOrEqual(3);
    expect(requiredRoboticsSections()).toEqual(['summary', 'cad', 'partsList', 'assembly']);
  });

  it('keeps explicit model on live stream', () => {
    const route = resolveRoboticsLiveStreamRoute('nex-n2-pro');
    expect(route.modelId).toBe('nex-n2-pro');
    expect(route.remappedFromAuto).toBe(false);
    expect(route.promptProfile).toBe('compact');
  });

  it('deep complete keeps ULTRA + caller model', () => {
    const route = resolveRoboticsDeepCompleteRoute('caval-auto/frontier');
    expect(route.modelId).toBe('caval-auto/frontier');
    expect(route.promptProfile).toBe('ultra');
    expect(route.intent).toBe('deep_thinking');
    expect(route.maxTokens).toBe(16_384);
    expect(route.systemPrompt).toBe(ROBOTICS_AI_ULTRA_SYSTEM_PROMPT);
  });
});
