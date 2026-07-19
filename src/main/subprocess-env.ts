/**
 * Env passed to terminals / shells — strip secrets that main injected via applyStoredSecretsToEnv.
 */

const SECRET_ENV_KEY_EXACT = new Set([
  "OPENROUTER_API_KEY",
  "POOLSIDE_API_KEY",
  "NORTH_API_KEY",
  "NVIDIA_API_KEY",
  "MESHY_API_KEY",
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
]);

const SECRET_ENV_SUFFIX = /_(API_KEY|SECRET|TOKEN|PASSWORD|CONNECTION_STRING)$/i;

/** Clone process.env without API keys / secrets for child terminals. */
export function sanitizeEnvForTerminal(
  source: NodeJS.ProcessEnv = process.env
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (SECRET_ENV_KEY_EXACT.has(key)) continue;
    if (SECRET_ENV_SUFFIX.test(key)) continue;
    out[key] = value;
  }
  return out;
}
