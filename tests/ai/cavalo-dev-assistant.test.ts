import { describe, expect, it } from 'vitest';
import { CAVALO_DEV_ASSISTANT_CORE } from '../../ai/prompts/cavalo-dev-assistant';
import { CODING_ARENA_SYSTEM_PROMPT } from '../../ai/prompts/coding-arena';
import { buildMultiModelSystemPrompt } from '../../ai/prompts/multi-model-reasoning-chat';

describe('cavalo-dev-assistant prompt', () => {
  it('defines CAVALO internal AI identity and layers', () => {
    expect(CAVALO_DEV_ASSISTANT_CORE).toContain('CAVALO Studio');
    expect(CAVALO_DEV_ASSISTANT_CORE).toContain('Context Engine');
    expect(CAVALO_DEV_ASSISTANT_CORE).toContain('caval.jsonc');
    expect(CAVALO_DEV_ASSISTANT_CORE).toContain('README.md');
  });

  it('mandates fast pipeline without missing-module messages', () => {
    expect(CAVALO_DEV_ASSISTANT_CORE).toContain('fast-pipeline.ts');
    expect(CAVALO_DEV_ASSISTANT_CORE).toContain('Nu spune niciodată că lipsește');
    expect(CAVALO_DEV_ASSISTANT_CORE).not.toContain('Fast pipeline Lipsă');
  });

  it('covers chat modes and file fence rules', () => {
    expect(CAVALO_DEV_ASSISTANT_CORE).toContain('Ask');
    expect(CAVALO_DEV_ASSISTANT_CORE).toContain('Code');
    expect(CAVALO_DEV_ASSISTANT_CORE).toContain('Architect');
    expect(CAVALO_DEV_ASSISTANT_CORE).toContain('Debug');
    expect(CAVALO_DEV_ASSISTANT_CORE).toContain('isScaffoldFragment');
    expect(CAVALO_DEV_ASSISTANT_CORE).toContain('Review strict');
  });

  it('is wired into Code Arena and multi-model chat prompts', () => {
    expect(CODING_ARENA_SYSTEM_PROMPT).toContain('CAVALO Studio');
    expect(buildMultiModelSystemPrompt({ agentMode: 'ask' })).toContain('CAVALO Studio');
  });
});
