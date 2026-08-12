/** Redact common secret patterns from logs, errors, and command output before returning to renderer. */
export function redactSensitiveCommandOutput(text: string): string {
  if (!text) return text;
  return text
    .replace(/sk-or-v1-[a-zA-Z0-9_-]{8,}/g, "sk-or-v1-[REDACTED]")
    .replace(/sk-ant-[a-zA-Z0-9_-]{10,}/g, "sk-ant-[REDACTED]")
    .replace(/sk-[a-zA-Z0-9_-]{10,}/g, "sk-[REDACTED]")
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "AIza[REDACTED]")
    .replace(/meshy[_-]?[a-zA-Z0-9_-]{12,}/gi, "meshy-[REDACTED]")
    .replace(/(Bearer\s+)[^\s'"]+/gi, "$1[REDACTED]")
    // HTTPS remotes with embedded credentials: https://user:token@host/...
    .replace(
      /(https?:\/\/)([^\/\s:@]+):([^\/\s@]+)@/gi,
      "$1$2:[REDACTED]@"
    )
    .replace(
      /(https?:\/\/)(x-access-token|oauth2|git):([^\/\s@]+)@/gi,
      "$1$2:[REDACTED]@"
    )
    .replace(
      /([A-Z_]*(?:API_KEY|TOKEN|SECRET|PASSWORD|PRIVATE_KEY|CONNECTION_STRING)[A-Z_]*\s*[=:]\s*)[^\s'"]+/gi,
      "$1[REDACTED]"
    )
    .replace(
      /(x-cad-api-key|x-billing-api-key|authorization)\s*[:=]\s*[^\s'"]+/gi,
      "$1: [REDACTED]"
    );
}

/** Alias for logs/errors — same rules as command output redaction. */
export const redactSensitiveText = redactSensitiveCommandOutput;
