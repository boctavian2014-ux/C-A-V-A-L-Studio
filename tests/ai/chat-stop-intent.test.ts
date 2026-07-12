import { describe, expect, it } from 'vitest';
import { isChatStopIntent } from '../../ai/composer/ai-store';

describe('isChatStopIntent', () => {
  it('detects common stop phrases', () => {
    expect(isChatStopIntent('stop')).toBe(true);
    expect(isChatStopIntent('oprește')).toBe(true);
    expect(isChatStopIntent('opreste')).toBe(true);
    expect(isChatStopIntent('anulează')).toBe(true);
    expect(isChatStopIntent('cancel')).toBe(true);
    expect(isChatStopIntent('stai')).toBe(true);
  });

  it('ignores normal prompts', () => {
    expect(isChatStopIntent('stop the bugs in auth')).toBe(false);
    expect(isChatStopIntent('build a todo app')).toBe(false);
    expect(isChatStopIntent('')).toBe(false);
  });
});
