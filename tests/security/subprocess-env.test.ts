import { describe, expect, it } from 'vitest';
import { sanitizeEnvForTerminal } from '../../src/main/subprocess-env';

describe('sanitizeEnvForTerminal (C4)', () => {
  it('strips OpenRouter, Meshy, and other API keys', () => {
    const sanitized = sanitizeEnvForTerminal({
      PATH: '/usr/bin',
      OPENROUTER_API_KEY: 'sk-or-secret',
      MESHY_API_KEY: 'msy_secret',
      CAD_API_KEY: 'cad',
      ANTHROPIC_API_KEY: 'sk-ant',
      MY_CUSTOM_API_KEY: 'custom',
      FOO_TOKEN: 'tok',
      HOME: '/home/user',
    });
    expect(sanitized.PATH).toBe('/usr/bin');
    expect(sanitized.HOME).toBe('/home/user');
    expect(sanitized.OPENROUTER_API_KEY).toBeUndefined();
    expect(sanitized.MESHY_API_KEY).toBeUndefined();
    expect(sanitized.CAD_API_KEY).toBeUndefined();
    expect(sanitized.ANTHROPIC_API_KEY).toBeUndefined();
    expect(sanitized.MY_CUSTOM_API_KEY).toBeUndefined();
    expect(sanitized.FOO_TOKEN).toBeUndefined();
  });
});
