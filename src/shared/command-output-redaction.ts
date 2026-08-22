/** Redact common secret patterns from logs, errors, and command output before returning to renderer. */

import type { AiRedactionLevel } from "./ai-settings-contract";

/** Always applied — even at `minimal`. Critical API keys / tokens / bearer. */
function applyCriticalRedaction(text: string): string {
  return text
    .replace(/ghp_[A-Za-z0-9_]{20,}/g, "ghp_[REDACTED]")
    .replace(/sk-or-v1-[a-zA-Z0-9_-]{8,}/g, "sk-or-v1-[REDACTED]")
    .replace(/sk-ant-[a-zA-Z0-9_-]{10,}/g, "sk-ant-[REDACTED]")
    .replace(/sk-[a-zA-Z0-9_-]{10,}/g, "sk-[REDACTED]")
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "AIza[REDACTED]")
    .replace(/(Bearer\s+)[^\s'"]+/gi, "$1[REDACTED]");
}

/** Standard extras — env-style secrets, remotes with credentials, common header keys. */
function applyStandardRedaction(text: string): string {
  return text
    .replace(/meshy[_-]?[a-zA-Z0-9_-]{12,}/gi, "meshy-[REDACTED]")
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
    )
    .replace(
      /("?(?:openRouterApiKey|meshApiKey|piapiApiKey)"?\s*[:=]\s*)["']?[^\s"',}\]]+["']?/gi,
      "$1[REDACTED]"
    );
}

/** Strict extras — emails and long opaque hex blobs that often carry secrets. */
function applyStrictRedaction(text: string): string {
  return text
    .replace(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      "[REDACTED_EMAIL]"
    )
    .replace(/\b[a-f0-9]{32,}\b/gi, "[REDACTED_HEX]");
}

export function redactSensitiveCommandOutput(
  text: string,
  level: AiRedactionLevel = "standard"
): string {
  if (!text) return text;
  let out = applyCriticalRedaction(text);
  if (level === "minimal") return out;
  out = applyStandardRedaction(out);
  if (level === "strict") out = applyStrictRedaction(out);
  return out;
}

/** Alias for logs/errors — same rules as command output redaction. */
export const redactSensitiveText = redactSensitiveCommandOutput;
