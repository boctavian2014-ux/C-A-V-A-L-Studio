import { describe, expect, it } from 'vitest';
import { sanitizeEnvForTerminal } from '../../src/main/subprocess-env';

describe('sanitizeEnvForTerminal (C4 / Lot B)', () => {
  it('strips OpenRouter, Meshy, Stripe, TOKEN/SECRET patterns, and other API keys', () => {
    const sanitized = sanitizeEnvForTerminal({
      PATH: '/usr/bin',
      OPENROUTER_API_KEY: 'sk-or-secret',
      OPENROUTER_BASE_URL: 'https://openrouter.ai',
      MESHY_API_KEY: 'msy_secret',
      MESHY_REGION: 'us',
      STRIPE_SECRET_KEY: 'sk_live',
      CAD_API_KEY: 'cad',
      ANTHROPIC_API_KEY: 'sk-ant',
      MY_CUSTOM_API_KEY: 'custom',
      FOO_TOKEN: 'tok',
      APP_SECRET: 'sec',
      HOME: '/home/user',
    });
    expect(sanitized.PATH).toBe('/usr/bin');
    expect(sanitized.HOME).toBe('/home/user');
    expect(sanitized.OPENROUTER_API_KEY).toBeUndefined();
    expect(sanitized.OPENROUTER_BASE_URL).toBeUndefined();
    expect(sanitized.MESHY_API_KEY).toBeUndefined();
    expect(sanitized.MESHY_REGION).toBeUndefined();
    expect(sanitized.STRIPE_SECRET_KEY).toBeUndefined();
    expect(sanitized.CAD_API_KEY).toBeUndefined();
    expect(sanitized.ANTHROPIC_API_KEY).toBeUndefined();
    expect(sanitized.MY_CUSTOM_API_KEY).toBeUndefined();
    expect(sanitized.FOO_TOKEN).toBeUndefined();
    expect(sanitized.APP_SECRET).toBeUndefined();
  });
});
