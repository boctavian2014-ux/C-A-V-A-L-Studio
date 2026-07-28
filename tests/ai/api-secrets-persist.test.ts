import { describe, expect, it } from 'vitest';

import {
  apiKeysToSecrets,
  buildSecretsPatch,
  filterNonEmptySecretsPatch,
  mergeSecrets,
  normalizeSecretsMap,
  resolveByokApiKeys,
  secretsToApiKeys,
  CONFIGURED_MARKER,
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

  it('mergeSecrets ignores __configured__ marker and keeps existing', () => {
    const existing = { OPENAI_API_KEY: 'sk-real' };
    const merged = mergeSecrets(existing, { OPENAI_API_KEY: CONFIGURED_MARKER });
    expect(merged).toEqual({ OPENAI_API_KEY: 'sk-real' });
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

  it('normalizeSecretsMap drops corrupted __configured__ values', () => {
    const normalized = normalizeSecretsMap({
      OPENAI_API_KEY: CONFIGURED_MARKER,
      OPENROUTER_API_KEY: 'sk-or',
    });
    expect(normalized.OPENAI_API_KEY).toBeUndefined();
    expect(normalized.OPENROUTER_API_KEY).toBe('sk-or');
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

  it('apiKeysToSecrets skips __configured__ markers', () => {
    expect(
      apiKeysToSecrets({
        openai: CONFIGURED_MARKER,
        anthropic: 'sk-ant',
      })
    ).toEqual({ ANTHROPIC_API_KEY: 'sk-ant' });
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
    });
  });

  it('buildSecretsPatch omits marker BYOK values', () => {
    const patch = buildSecretsPatch({
      apiKeys: { openai: CONFIGURED_MARKER, anthropic: 'sk-ant' },
    });
    expect(patch).toEqual({ ANTHROPIC_API_KEY: 'sk-ant' });
  });

  it('filterNonEmptySecretsPatch drops empty values and lists saved keys', () => {
    const { filtered, savedKeys } = filterNonEmptySecretsPatch({
      OPENROUTER_API_KEY: 'sk-or',
      PIAPI_API_KEY: '  ',
      MESHY_API_KEY: '',
      ANTHROPIC_API_KEY: 'sk-ant',
    });
    expect(filtered).toEqual({
      OPENROUTER_API_KEY: 'sk-or',
      ANTHROPIC_API_KEY: 'sk-ant',
    });
    expect(savedKeys.sort()).toEqual(['ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY']);
  });

  it('filterNonEmptySecretsPatch drops __configured__', () => {
    const { filtered, savedKeys } = filterNonEmptySecretsPatch({
      OPENAI_API_KEY: CONFIGURED_MARKER,
      OPENROUTER_API_KEY: 'sk-or',
    });
    expect(filtered).toEqual({ OPENROUTER_API_KEY: 'sk-or' });
    expect(savedKeys).toEqual(['OPENROUTER_API_KEY']);
  });

  it('filterNonEmptySecretsPatch returns empty list for all-blank patch', () => {
    const { filtered, savedKeys } = filterNonEmptySecretsPatch({
      OPENROUTER_API_KEY: '',
      PIAPI_API_KEY: '   ',
    });
    expect(filtered).toEqual({});
    expect(savedKeys).toEqual([]);
  });

  it('resolveByokApiKeys prefers real preferred over env; ignores markers', () => {
    const keys = resolveByokApiKeys(
      { openai: CONFIGURED_MARKER, anthropic: 'sk-from-ui' },
      {
        OPENAI_API_KEY: 'sk-from-env',
        ANTHROPIC_API_KEY: 'sk-env-ant',
      } as NodeJS.ProcessEnv
    );
    expect(keys.openai).toBe('sk-from-env');
    expect(keys.anthropic).toBe('sk-from-ui');
  });
});
