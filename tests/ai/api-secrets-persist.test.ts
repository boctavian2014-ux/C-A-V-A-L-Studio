import { describe, expect, it } from 'vitest';

import {
  apiKeysToSecrets,
  buildSecretsPatch,
  mergeSecrets,
  normalizeSecretsMap,
  secretsToApiKeys,
} from '../../ai/models/api-secrets';

describe('api secrets persistence helpers', () => {
  it('mergeSecrets keeps existing keys on partial patch', () => {
    const existing = { OPENROUTER_API_KEY: 'or-1', POOLSIDE_API_KEY: 'ps-1' };
    const merged = mergeSecrets(existing, { NVIDIA_API_KEY: 'nv-1' });
    expect(merged).toEqual({
      OPENROUTER_API_KEY: 'or-1',
      POOLSIDE_API_KEY: 'ps-1',
      NVIDIA_API_KEY: 'nv-1',
    });
  });

  it('mergeSecrets removes key when value is empty', () => {
    const existing = { OPENROUTER_API_KEY: 'or-1', POOLSIDE_API_KEY: 'ps-1' };
    const merged = mergeSecrets(existing, { OPENROUTER_API_KEY: '' });
    expect(merged).toEqual({ POOLSIDE_API_KEY: 'ps-1' });
  });

  it('normalizeSecretsMap migrates legacy lowercase BYOK keys', () => {
    const normalized = normalizeSecretsMap({
      anthropic: 'sk-ant',
      OPENROUTER_API_KEY: 'sk-or',
    });
    expect(normalized.ANTHROPIC_API_KEY).toBe('sk-ant');
    expect(normalized.OPENROUTER_API_KEY).toBe('sk-or');
    expect(normalized.anthropic).toBeUndefined();
  });

  it('apiKeysToSecrets and secretsToApiKeys round-trip', () => {
    const apiKeys = {
      anthropic: 'sk-ant',
      openai: 'sk-oai',
      google: 'AIza',
    };
    const secrets = apiKeysToSecrets(apiKeys);
    expect(secrets).toEqual({
      ANTHROPIC_API_KEY: 'sk-ant',
      OPENAI_API_KEY: 'sk-oai',
      GOOGLE_API_KEY: 'AIza',
    });
    expect(secretsToApiKeys(secrets)).toEqual(apiKeys);
  });

  it('buildSecretsPatch combines openRouter, providers, and BYOK keys', () => {
    const patch = buildSecretsPatch({
      openRouter: 'sk-or',
      providerSecrets: { POOLSIDE_API_KEY: 'ps-1' },
      apiKeys: { anthropic: 'sk-ant' },
    });
    expect(patch).toEqual({
      OPENROUTER_API_KEY: 'sk-or',
      POOLSIDE_API_KEY: 'ps-1',
      ANTHROPIC_API_KEY: 'sk-ant',
      OPENAI_API_KEY: '',
      GOOGLE_API_KEY: '',
    });
  });
});
