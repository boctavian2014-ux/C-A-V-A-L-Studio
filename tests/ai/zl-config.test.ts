import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ZERO_LATENCY_CONFIG,
  isFrontierSelection,
  loadZeroLatencyConfig,
} from '../../ai/composer/zero-latency/zl-config';

describe('zl-config', () => {
  it('defaults are enabled with frontier prewarm', () => {
    expect(DEFAULT_ZERO_LATENCY_CONFIG.enabled).toBe(true);
    expect(DEFAULT_ZERO_LATENCY_CONFIG.frontierPrewarm).toBe(true);
    expect(DEFAULT_ZERO_LATENCY_CONFIG.draftPlan).toBe('fast-then-frontier');
  });

  it('loadZeroLatencyConfig merges caval.jsonc when present', () => {
    const cfg = loadZeroLatencyConfig(process.cwd());
    expect(cfg.maxWarmFiles).toBeGreaterThanOrEqual(2);
    expect(cfg.typingDebounceMs).toBeGreaterThanOrEqual(200);
  });

  it('isFrontierSelection detects auto frontier tier', () => {
    expect(isFrontierSelection('caval-auto/frontier')).toBe(true);
    expect(isFrontierSelection('nex-n2-pro')).toBe(true);
    expect(isFrontierSelection('caval-auto/balanced')).toBe(false);
  });
});
