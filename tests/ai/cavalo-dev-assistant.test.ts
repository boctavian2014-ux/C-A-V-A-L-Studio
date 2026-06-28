import { describe, expect, it } from 'vitest';
import { CAVALO_DEV_ASSISTANT_CORE } from '../../ai/prompts/cavalo-dev-assistant';
import { CODING_ARENA_SYSTEM_PROMPT } from '../../ai/prompts/coding-arena';
import { buildMultiModelSystemPrompt } from '../../ai/prompts/multi-model-reasoning-chat';

describe('cavalo-dev-assistant prompt', () => {
  it('defines Cavalo System AI identity and layers', () => {
    expect(CAVALO_DEV_ASSISTANT_CORE).toContain('Cavalo System AI');
    expect(CAVALO_DEV_ASSISTANT_CORE).toContain('CAVALO Studio');
    expect(CAVALO_DEV_ASSISTANT_CORE).toContain('Context Engine');
    expect(CAVALO_DEV_ASSISTANT_CORE).toContain('caval.jsonc');
    expect(CAVALO_DEV_ASSISTANT_CORE).toContain('README.md');
  });

  it('mandates fast pipeline without missing-module messages', () => {
    expect(CAVALO_DEV_ASSISTANT_CORE).toContain('ai/pipeline/');
    expect(CAVALO_DEV_ASSISTANT_CORE).toContain('Fast pipeline Lipsă');
    expect(CAVALO_DEV_ASSISTANT_CORE).toContain('CREEAZĂ-L');
  });

  it('covers chat modes including Agentic and MCP auto-start', () => {
    expect(CAVALO_DEV_ASSISTANT_CORE).toContain('Ask');
    expect(CAVALO_DEV_ASSISTANT_CORE).toContain('Code');
    expect(CAVALO_DEV_ASSISTANT_CORE).toContain('Agentic');
    expect(CAVALO_DEV_ASSISTANT_CORE).toContain('Architect');
    expect(CAVALO_DEV_ASSISTANT_CORE).toContain('Debug');
    expect(CAVALO_DEV_ASSISTANT_CORE).toContain('mcp.servers');
    expect(CAVALO_DEV_ASSISTANT_CORE).toContain('ensureMcpServersReady');
    expect(CAVALO_DEV_ASSISTANT_CORE).toContain('isScaffoldFragment');
  });

  it('documents Agentic arena pipeline and scaffold apply', () => {
    expect(CAVALO_DEV_ASSISTANT_CORE).toContain('applyPipelineScaffold');
    expect(CAVALO_DEV_ASSISTANT_CORE).toContain('Compose → Scaffold → Workspace');
  });

  it('is wired into Code Arena and multi-model chat prompts', () => {
    expect(CODING_ARENA_SYSTEM_PROMPT).toContain('CAVALO Studio');
    expect(buildMultiModelSystemPrompt({ agentMode: 'ask' })).toContain('Cavalo System AI');
  });
});
