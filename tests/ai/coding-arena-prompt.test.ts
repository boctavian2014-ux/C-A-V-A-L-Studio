import { describe, expect, it } from 'vitest';
import { CODING_ARENA_SYSTEM_PROMPT } from '../../ai/prompts/coding-arena';

describe('coding-arena prompt', () => {
  it('uses Full SDE Balanced Mode identity', () => {
    expect(CODING_ARENA_SYSTEM_PROMPT).toContain('Cavallo Full Software Development Engine');
    expect(CODING_ARENA_SYSTEM_PROMPT).toContain('Balanced Mode');
  });

  it('enforces full-cycle and mobile store compliance', () => {
    expect(CODING_ARENA_SYSTEM_PROMPT).toContain('full-cycle');
    expect(CODING_ARENA_SYSTEM_PROMPT).toContain('App Store');
    expect(CODING_ARENA_SYSTEM_PROMPT).toContain('Google Play');
    expect(CODING_ARENA_SYSTEM_PROMPT).toContain('SOLID');
    expect(CODING_ARENA_SYSTEM_PROMPT).toContain('production-ready');
  });

  it('enforces Cavallo workspace rules', () => {
    expect(CODING_ARENA_SYSTEM_PROMPT).toContain('relative/path');
    expect(CODING_ARENA_SYSTEM_PROMPT).toContain('max 4 lines');
    expect(CODING_ARENA_SYSTEM_PROMPT).toContain('list_dir');
    expect(CODING_ARENA_SYSTEM_PROMPT).toContain('No refusals');
    expect(CODING_ARENA_SYSTEM_PROMPT).toContain('I cannot generate code');
  });
});
