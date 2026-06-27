import { describe, expect, it } from 'vitest';
import {
  REASONING_COMMUNICATION_PROMPT,
  REASONING_CHAT_ADDON,
} from '../../ai/prompts/reasoning-layer';
import { FINAL_COMPOSER_WITH_REASONING } from '../../ai/prompts/multi-agent/final-composer';

describe('reasoning-layer prompt', () => {
  it('exports Step 1-4 keywords', () => {
    expect(REASONING_COMMUNICATION_PROMPT).toContain('Step 1');
    expect(REASONING_COMMUNICATION_PROMPT).toContain('Step 2');
    expect(REASONING_COMMUNICATION_PROMPT).toContain('Step 3');
    expect(REASONING_COMMUNICATION_PROMPT).toContain('Step 4');
  });

  it('includes Cavalo IDE constraints', () => {
    expect(REASONING_COMMUNICATION_PROMPT).toContain('fenced blocks');
    expect(REASONING_CHAT_ADDON).toContain('Recap');
  });

  it('is composed into final composer prompt', () => {
    expect(FINAL_COMPOSER_WITH_REASONING).toContain('Final Code Composer');
    expect(FINAL_COMPOSER_WITH_REASONING).toContain('Balanced Mode');
  });
});
