import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkModelReadiness, isByokModel, hasOpenRouterKey, hasProviderKey } from '../../ai/models/model-readiness';
import { buildModelsHealthSnapshot, modelHealthLabel } from '../../ai/models/model-health';

vi.mock('../../ai/models/ollama-client', () => ({
  isOllamaReachable: vi.fn(),
  fetchInstalledOllamaModels: vi.fn(),
}));

import { isOllamaReachable, fetchInstalledOllamaModels } from '../../ai/models/ollama-client';

describe('model-readiness', () => {
  beforeEach(() => {
    vi.mocked(isOllamaReachable).mockReset();
    vi.mocked(fetchInstalledOllamaModels).mockReset();
    vi.mocked(fetchInstalledOllamaModels).mockResolvedValue(['qwen2.5-coder:7b']);
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

  it('reports Ollama required for Auto Free when unreachable and no OR key', async () => {
    vi.mocked(isOllamaReachable).mockResolvedValue(false);
    const result = await checkModelReadiness('caval-auto/free', {});
    expect(result.ready).toBe(false);
    if (!result.ready) {
      expect(result.hint).toMatch(/Ollama|OpenRouter/i);
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

  it('requires Poolside key for poolside-laguna-m-1', async () => {
    const result = await checkModelReadiness('poolside-laguna-m-1', {}, {
      openRouterApiKey: 'sk-or-test',
    });
    expect(result.ready).toBe(false);
    if (!result.ready) {
      expect(result.reason).toMatch(/poolside/i);
    }
  });

  it('requires NVIDIA key for nvidia-nemotron-3-ultra', async () => {
    const result = await checkModelReadiness('nvidia-nemotron-3-ultra', {}, {
      openRouterApiKey: 'sk-or-test',
    });
    expect(result.ready).toBe(false);
    if (!result.ready) {
      expect(result.reason).toMatch(/nvidia/i);
    }
  });

  it('requires North key for north-mini-code', async () => {
    const result = await checkModelReadiness('north-mini-code', {}, {
      openRouterApiKey: 'sk-or-test',
    });
    expect(result.ready).toBe(false);
    if (!result.ready) {
      expect(result.reason).toMatch(/north/i);
    }
  });

  it('marks local model not_installed when tag missing', async () => {
    vi.mocked(isOllamaReachable).mockResolvedValue(true);
    vi.mocked(fetchInstalledOllamaModels).mockResolvedValue(['qwen2.5-coder:7b']);
    const result = await checkModelReadiness('llama3.1:8b', {});
    expect(result.ready).toBe(false);
    if (!result.ready) {
      expect(result.hint).toMatch(/ollama pull/i);
    }
  });
});

describe('model-health', () => {
  beforeEach(() => {
    vi.mocked(isOllamaReachable).mockResolvedValue(true);
    vi.mocked(fetchInstalledOllamaModels).mockResolvedValue(['qwen2.5-coder:7b']);
  });

  it('builds health snapshot with model statuses', async () => {
    const snapshot = await buildModelsHealthSnapshot();
    expect(snapshot.models['qwen2.5-coder:7b']).toBe('ready');
    expect(snapshot.models['poolside-laguna-m-1']).toBe('missing_key');
    expect(snapshot.summary).toMatch(/Modele CAVALLO/);
  });

  it('labels health statuses', () => {
    expect(modelHealthLabel('ready')).toBe('Gata');
    expect(modelHealthLabel('missing_key')).toBe('Cheie lipsă');
  });
});

describe('hasProviderKey', () => {
  it('reads from secrets map', () => {
    expect(hasProviderKey('nvidia', { NVIDIA_API_KEY: 'nvapi-x' })).toBe(true);
    expect(hasProviderKey('nvidia', {})).toBe(false);
  });
});
