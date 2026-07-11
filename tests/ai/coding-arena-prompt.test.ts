import { describe, expect, it } from 'vitest';
import { CODING_ARENA_SYSTEM_PROMPT } from '../../ai/prompts/coding-arena';

describe('coding-arena prompt', () => {
  it('includes 9 agents', () => {
    expect(CODING_ARENA_SYSTEM_PROMPT).toContain('9-agent');
    expect(CODING_ARENA_SYSTEM_PROMPT).toContain('ARCHITECT');
    expect(CODING_ARENA_SYSTEM_PROMPT).toContain('PERFORMANCE OPTIMIZER');
    expect(CODING_ARENA_SYSTEM_PROMPT).toContain('AI MODEL ORCHESTRATOR');
  });
});
