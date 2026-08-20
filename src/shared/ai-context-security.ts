import { redactSensitiveCommandOutput } from "./command-output-redaction";

/**
 * Paths that must never be sent to AI providers as editor context.
 * Same boundary mindset as log redaction (M2): secrets stay local.
 */
const SENSITIVE_FILE_PATTERNS: RegExp[] = [
  /\.env(\.|$)/i,
  /(^|[\\/])\.npmrc$/i,
  /\.(key|pem|p12|pfx)$/i,
  /secrets?\./i,
  /credentials?\./i,
  /(^|[\\/])id_rsa(\.|$)/i,
  /(^|[\\/])id_ed25519(\.|$)/i,
  /(^|[\\/])\.netrc$/i,
];

export function isSensitiveFile(path: string): boolean {
  const normalized = path.replace(/\\/g, "/").trim();
  if (!normalized) return false;
  return SENSITIVE_FILE_PATTERNS.some((p) => p.test(normalized));
}

/** Redact secret-like substrings; never return the original match. */
export function sanitizeFileContent(content: string): string {
  if (!content) return content;
  return redactSensitiveCommandOutput(content);
}

export function sanitizeIdeText(text: string): string {
  return sanitizeFileContent(text);
}
