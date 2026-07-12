import { describe, it, expect } from 'vitest';
import { resolveModelForMode, resolveAutocompleteModel } from '../../ai/config/caval-config-shared';
import { DEFAULT_CAVAL_CONFIG } from '../../ai/modes/agent-modes';

describe('caval-config', () => {
  it('resolveModelForMode uses perMode from config', () => {
    const config = {
      ...DEFAULT_CAVAL_CONFIG,
      models: {
        default: 'caval-auto/balanced',
        perMode: { code: 'caval-auto/free' as const },
      },
    };
    expect(resolveModelForMode('code', config)).toBe('caval-auto/free');
  });

  it('resolveAutocompleteModel falls back to Ollama when North key missing', () => {
    const prev = process.env.NORTH_API_KEY;
    delete process.env.NORTH_API_KEY;
    expect(resolveAutocompleteModel(DEFAULT_CAVAL_CONFIG)).toBe('qwen2.5-coder:7b');
    if (prev) process.env.NORTH_API_KEY = prev;
  });
});
