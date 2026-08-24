import { describe, expect, it } from 'vitest';
import {
  MULTI_MODEL_REASONING_CHAT_PROMPT,
  MULTI_MODEL_RECAP_ADDON,
  MULTI_MODEL_COLLABORATION_ADDON,
  buildMultiModelSystemPrompt,
  modeHintForAgent,
} from '../../ai/prompts/multi-model-reasoning-chat';

describe('multi-model-reasoning-chat', () => {
  it('exports three mode descriptions', () => {
    expect(MULTI_MODEL_REASONING_CHAT_PROMPT).toContain('MODE 1');
    expect(MULTI_MODEL_REASONING_CHAT_PROMPT).toContain('MODE 2');
    expect(MULTI_MODEL_REASONING_CHAT_PROMPT).toContain('MODE 3');
    expect(MULTI_MODEL_REASONING_CHAT_PROMPT).toContain('AUTO-SWITCHING');
  });

  it('does not append the recap addon to streaming system prompts', () => {
    expect(MULTI_MODEL_RECAP_ADDON).toContain('Understood');
    const prompt = buildMultiModelSystemPrompt({ agentMode: 'ask' });
    expect(prompt).not.toContain(MULTI_MODEL_RECAP_ADDON.trim());
  });

  it('maps agent modes to hints', () => {
    expect(modeHintForAgent('code')).toBe('technical');
    expect(modeHintForAgent('plan')).toBe('technical');
    expect(modeHintForAgent('ask')).toBe('chat');
  });

  it('buildMultiModelSystemPrompt adds collaboration addon', () => {
    const prompt = buildMultiModelSystemPrompt({ collaboration: true, agentMode: 'ask' });
    expect(prompt).toContain(MULTI_MODEL_COLLABORATION_ADDON.trim().slice(0, 20));
  });
});
