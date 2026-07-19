import { describe, expect, it } from 'vitest';

/**
 * Unit coverage for C2 secret redaction helpers (mirrors electron-main logic).
 * Full IPC is covered separately; this locks the redaction contract.
 */

const RENDERER_REDACTED_SECRET_KEYS = new Set([
  'OPENROUTER_API_KEY',
  'MESHY_API_KEY',
  'CAD_API_KEY',
]);

function redactSecretsForRenderer(
  stored: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(stored)) {
    if (RENDERER_REDACTED_SECRET_KEYS.has(key)) continue;
    if (value?.trim()) out[key] = value;
  }
  return out;
}

function buildSecretsConfiguredMap(
  stored: Record<string, string>,
  env: Record<string, string | undefined> = {}
): Record<string, boolean> {
  const keys = [
    'OPENROUTER_API_KEY',
    'MESHY_API_KEY',
    'CAD_API_KEY',
    'ANTHROPIC_API_KEY',
  ];
  const configured: Record<string, boolean> = {};
  for (const key of keys) {
    configured[key] = Boolean(stored[key]?.trim() || env[key]?.trim());
  }
  return configured;
}

describe('C2 secrets redaction for renderer', () => {
  it('strips OpenRouter/Meshy/CAD values from secrets payload', () => {
    const redacted = redactSecretsForRenderer({
      OPENROUTER_API_KEY: 'sk-or-secret',
      MESHY_API_KEY: 'msy_secret',
      CAD_API_KEY: 'cad-secret',
      ANTHROPIC_API_KEY: 'sk-ant-ok',
    });
    expect(redacted.OPENROUTER_API_KEY).toBeUndefined();
    expect(redacted.MESHY_API_KEY).toBeUndefined();
    expect(redacted.CAD_API_KEY).toBeUndefined();
    expect(redacted.ANTHROPIC_API_KEY).toBe('sk-ant-ok');
  });

  it('reports configured:true without exposing values', () => {
    const stored = { OPENROUTER_API_KEY: 'sk-or-secret', MESHY_API_KEY: 'msy_x' };
    const configured = buildSecretsConfiguredMap(stored);
    const redacted = redactSecretsForRenderer(stored);
    expect(configured.OPENROUTER_API_KEY).toBe(true);
    expect(configured.MESHY_API_KEY).toBe(true);
    expect(redacted).toEqual({});
  });

  it('treats process.env as configured when stored map is empty', () => {
    const configured = buildSecretsConfiguredMap(
      {},
      { OPENROUTER_API_KEY: 'from-env', MESHY_API_KEY: undefined }
    );
    expect(configured.OPENROUTER_API_KEY).toBe(true);
    expect(configured.MESHY_API_KEY).toBe(false);
  });
});
