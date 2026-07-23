import { describe, expect, it } from 'vitest';

/**
 * Unit coverage for secret redaction helpers (mirrors electron-main logic).
 * Full IPC is covered separately; this locks the redaction contract.
 */

const SECRET_ENV_KEYS = [
  'OPENROUTER_API_KEY',
  'POOLSIDE_API_KEY',
  'NORTH_API_KEY',
  'NVIDIA_API_KEY',
  'MESHY_API_KEY',
  'CAD_API_KEY',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GOOGLE_API_KEY',
  'FIRECRAWL_API_KEY',
  'POSTGRES_CONNECTION_STRING',
  'GITHUB_PERSONAL_ACCESS_TOKEN',
  'SEMGREP_APP_TOKEN',
  'SUPABASE_SERVICE_ROLE_KEY',
  'BILLING_API_KEY',
] as const;

const RENDERER_REDACTED_SECRET_KEYS = new Set<string>(SECRET_ENV_KEYS);

function redactSecretsForRenderer(
  stored: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(stored)) {
    if (RENDERER_REDACTED_SECRET_KEYS.has(key)) continue;
    if (/(_API_KEY|_TOKEN|_SECRET|SERVICE_ROLE|CONNECTION_STRING)$/i.test(key)) {
      continue;
    }
    if (value?.trim()) out[key] = value;
  }
  return out;
}

function buildSecretsConfiguredMap(
  stored: Record<string, string>,
  env: Record<string, string | undefined> = {}
): Record<string, boolean> {
  const configured: Record<string, boolean> = {};
  for (const key of SECRET_ENV_KEYS) {
    configured[key] = Boolean(stored[key]?.trim() || env[key]?.trim());
  }
  return configured;
}

describe('C2 secrets redaction for renderer', () => {
  it('strips all SECRET_ENV_KEYS values from secrets payload', () => {
    const stored: Record<string, string> = {
      OPENROUTER_API_KEY: 'sk-or-secret',
      MESHY_API_KEY: 'msy_secret',
      CAD_API_KEY: 'cad-secret',
      ANTHROPIC_API_KEY: 'sk-ant-ok',
      OPENAI_API_KEY: 'sk-openai',
      SUPABASE_SERVICE_ROLE_KEY: 'sb-service',
      BILLING_API_KEY: 'bill-secret',
      SAFE_PUBLIC_FLAG: 'ok',
    };
    const redacted = redactSecretsForRenderer(stored);
    for (const key of SECRET_ENV_KEYS) {
      expect(redacted[key]).toBeUndefined();
    }
    expect(redacted.SAFE_PUBLIC_FLAG).toBe('ok');
  });

  it('reports configured:true without exposing values', () => {
    const stored = {
      OPENROUTER_API_KEY: 'sk-or-secret',
      MESHY_API_KEY: 'msy_x',
      ANTHROPIC_API_KEY: 'sk-ant',
    };
    const configured = buildSecretsConfiguredMap(stored);
    const redacted = redactSecretsForRenderer(stored);
    expect(configured.OPENROUTER_API_KEY).toBe(true);
    expect(configured.MESHY_API_KEY).toBe(true);
    expect(configured.ANTHROPIC_API_KEY).toBe(true);
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

  it('redacts unknown *_API_KEY / SERVICE_ROLE patterns', () => {
    const redacted = redactSecretsForRenderer({
      CUSTOM_API_KEY: 'x',
      OTHER_SERVICE_ROLE: 'y',
      note: 'public',
    });
    expect(redacted.CUSTOM_API_KEY).toBeUndefined();
    expect(redacted.OTHER_SERVICE_ROLE).toBeUndefined();
    expect(redacted.note).toBe('public');
  });
});
