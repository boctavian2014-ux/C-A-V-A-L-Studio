import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearOllamaReachableCache,
  fetchInstalledOllamaModels,
  getOllamaBaseUrl,
  isOllamaReachable,
} from '../../ai/models/ollama-client';
import { OLLAMA_LOOPBACK_URL, OLLAMA_TAGS_URL } from '../../src/shared/local-ai-contract';

describe('ollama-client', () => {
  afterEach(() => {
    clearOllamaReachableCache();
    vi.unstubAllGlobals();
  });

  it('exposes the loopback base URL', () => {
    expect(getOllamaBaseUrl()).toBe(OLLAMA_LOOPBACK_URL);
  });

  it('reports reachable when tags fetch succeeds and caches the result', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ models: [] }) });
    vi.stubGlobal('fetch', fetchMock);

    await expect(isOllamaReachable()).resolves.toBe(true);
    await expect(isOllamaReachable()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      OLLAMA_TAGS_URL,
      expect.objectContaining({ signal: expect.anything() })
    );
  });

  it('bypasses the cache when force is true', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false });
    vi.stubGlobal('fetch', fetchMock);

    await expect(isOllamaReachable()).resolves.toBe(true);
    await expect(isOllamaReachable({ force: true })).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns false when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    await expect(isOllamaReachable({ force: true })).resolves.toBe(false);
  });

  it('lists installed model names from tags JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ models: [{ name: 'llama3' }, { name: 'qwen2.5-coder' }] }),
      })
    );
    await expect(fetchInstalledOllamaModels()).resolves.toEqual(['llama3', 'qwen2.5-coder']);
  });

  it('returns an empty list when tags JSON omits models', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      })
    );
    await expect(fetchInstalledOllamaModels()).resolves.toEqual([]);
  });

  it('returns an empty list when tags fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) })
    );
    await expect(fetchInstalledOllamaModels()).resolves.toEqual([]);
  });

  it('returns an empty list when tags fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
    await expect(fetchInstalledOllamaModels()).resolves.toEqual([]);
  });
});
