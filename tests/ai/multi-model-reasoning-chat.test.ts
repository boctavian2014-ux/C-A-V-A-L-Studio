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
  });

  it('includes auto-switching and end recap', () => {
    expect(MULTI_MODEL_REASONING_CHAT_PROMPT).toContain('AUTO-SWITCHING');
    expect(MULTI_MODEL_REASONING_CHAT_PROMPT).toContain('END-OF-RESPONSE SUMMARY');
    expect(MULTI_MODEL_RECAP_ADDON).toContain('Understood');
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
