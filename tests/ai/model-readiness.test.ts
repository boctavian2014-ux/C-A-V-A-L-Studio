import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkModelReadiness, isByokModel, hasOpenRouterKey } from '../../ai/models/model-readiness';

vi.mock('../../ai/models/ollama-client', () => ({
  isOllamaReachable: vi.fn(),
}));

import { isOllamaReachable } from '../../ai/models/ollama-client';

describe('model-readiness', () => {
  beforeEach(() => {
    vi.mocked(isOllamaReachable).mockReset();
  });

  it('identifies BYOK models', () => {
    expect(isByokModel('gpt-4o')).toBe(true);
    expect(isByokModel('caval-auto/free')).toBe(false);
    expect(isByokModel('openrouter:anthropic/claude-3-haiku')).toBe(false);
  });

  it('detects OpenRouter key from options', () => {
    expect(hasOpenRouterKey('sk-or-test')).toBe(true);
    expect(hasOpenRouterKey('')).toBe(false);
    expect(hasOpenRouterKey(undefined, { OPENROUTER_API_KEY: 'sk-or-x' })).toBe(true);
  });

  it('reports Ollama required for Auto Free when unreachable', async () => {
    vi.mocked(isOllamaReachable).mockResolvedValue(false);
    const result = await checkModelReadiness('caval-auto/free', {});
    expect(result.ready).toBe(false);
    if (!result.ready) {
      expect(result.hint).toMatch(/Ollama/i);
    }
  });

  it('reports ready for Auto Free when Ollama is up', async () => {
    vi.mocked(isOllamaReachable).mockResolvedValue(true);
    const result = await checkModelReadiness('caval-auto/free', {});
    expect(result.ready).toBe(true);
  });

  it('requires OpenRouter key for openrouter models', async () => {
    const result = await checkModelReadiness('openrouter:qwen/qwen-2.5-coder-32b-instruct:free', {});
    expect(result.ready).toBe(false);
    if (!result.ready) {
      expect(result.hint).toMatch(/OpenRouter/i);
    }
  });
});
