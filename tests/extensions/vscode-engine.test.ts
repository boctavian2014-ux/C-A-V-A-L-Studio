import { describe, expect, it } from 'vitest';

import { CAVALLO_VSCODE_ENGINE, isVsCodeEngineCompatible } from '../../src/extensions/vscode-engine';

describe('vscode-engine', () => {
  it('exports CAVALLO engine version', () => {
    expect(CAVALLO_VSCODE_ENGINE).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('accepts compatible caret ranges', () => {
    expect(isVsCodeEngineCompatible('^1.80.0')).toBe(true);
    expect(isVsCodeEngineCompatible('^1.85.0')).toBe(true);
  });

  it('rejects incompatible major versions', () => {
    expect(isVsCodeEngineCompatible('^2.0.0')).toBe(false);
  });

  it('accepts >= ranges', () => {
    expect(isVsCodeEngineCompatible('>=1.70.0')).toBe(true);
    expect(isVsCodeEngineCompatible('>=1.90.0')).toBe(false);
  });

  it('rejects missing engine', () => {
    expect(isVsCodeEngineCompatible(undefined)).toBe(false);
    expect(isVsCodeEngineCompatible('')).toBe(false);
  });
});
