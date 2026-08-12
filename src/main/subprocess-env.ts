/**
 * Env passed to terminals / shells — strip secrets that main injected via applyStoredSecretsToEnv.
 */

const SECRET_ENV_KEY_EXACT = new Set([
  "OPENROUTER_API_KEY",
  "POOLSIDE_API_KEY",
  "NORTH_API_KEY",
  "NVIDIA_API_KEY",
  "MESHY_API_KEY",
  "PIAPI_API_KEY",
  "TRELLIS_API_KEY",
  "CAD_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_API_KEY",
  "FIRECRAWL_API_KEY",
  "POSTGRES_CONNECTION_STRING",
  "GITHUB_PERSONAL_ACCESS_TOKEN",
  "SEMGREP_APP_TOKEN",
  "CAVAL_CLOUD_API_KEY",
  "BILLING_API_KEY",
  "BILLING_ADMIN_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
]);

/** Suffix patterns: *_API_KEY, *_SECRET, *_TOKEN, … */
const SECRET_ENV_SUFFIX = /_(API_KEY|SECRET|TOKEN|PASSWORD|CONNECTION_STRING)$/i;

/**
 * Lot B: strip ALL env vars matching:
 * - exact known secret keys
 * - *_API_KEY / *TOKEN* / *SECRET* (and suffix forms)
 * - OPENROUTER*, MESHY*, STRIPE*
 */
export function isSecretEnvKey(key: string): boolean {
  if (SECRET_ENV_KEY_EXACT.has(key)) return true;
  if (SECRET_ENV_SUFFIX.test(key)) return true;
  if (/TOKEN/i.test(key)) return true;
  if (/SECRET/i.test(key)) return true;
  if (/_API_KEY$/i.test(key) || /API_KEY/i.test(key)) return true;
  if (/^OPENROUTER/i.test(key)) return true;
  if (/^MESHY/i.test(key)) return true;
  if (/^STRIPE/i.test(key)) return true;
  return false;
}

/** Clone process.env without API keys / secrets for child terminals and automated runners. */
export function sanitizeEnvForTerminal(
  source: NodeJS.ProcessEnv = process.env
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (isSecretEnvKey(key)) continue;
    out[key] = value;
  }
  return out;
}
