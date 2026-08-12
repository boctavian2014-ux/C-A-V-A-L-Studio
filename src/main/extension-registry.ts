/**
 * Lot C2 — allowlisted registries + extension ID validation.
 * Renderer never supplies download URLs; main resolves hosts exclusively here.
 */

export const INTEGRITY_METADATA_MISSING_ERROR =
  "Registry-ul nu oferă metadata de integritate verificabilă pentru această extensie";

/** Official Open VSX API + content CDN (redirect target observed on open-vsx.org). */
export const DEFAULT_OPENVSX_ALLOWED_HOSTS = [
  "open-vsx.org",
  "www.open-vsx.org",
  "openvsx.eclipsecontent.org",
] as const;

/** Future / env-configurable CAVALLO marketplace hosts (https). */
export const DEFAULT_MARKETPLACE_ALLOWED_HOSTS = [
  "marketplace.cavallo.dev",
  "marketplace.caval.studio",
] as const;

export const EXTENSION_INSTALL_LIMITS = {
  VSIX_MAX_BYTES: 50 * 1024 * 1024,
  ZIP_MAX_ENTRIES: 2_000,
  ZIP_MAX_UNCOMPRESSED_BYTES: 200 * 1024 * 1024,
  SHA256_RESPONSE_MAX_BYTES: 4_096,
  METADATA_MAX_BYTES: 2 * 1024 * 1024,
} as const;

function parseAllowedHostsEnv(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;\s]+/)
    .map((h) => h.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, ""))
    .filter(Boolean);
}

export function getOpenVsxAllowedHosts(): string[] {
  const fromEnv = parseAllowedHostsEnv(process.env.OPENVSX_ALLOWED_HOSTS);
  return [...new Set([...DEFAULT_OPENVSX_ALLOWED_HOSTS, ...fromEnv])];
}

export function getMarketplaceAllowedHosts(): string[] {
  const fromEnv = parseAllowedHostsEnv(process.env.CAVAL_MARKETPLACE_ALLOWED_HOSTS);
  return [...new Set([...DEFAULT_MARKETPLACE_ALLOWED_HOSTS, ...fromEnv])];
}

const EXT_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._\-]*\.[a-zA-Z0-9][a-zA-Z0-9._\-]*$/;
const SEGMENT_RE = /^[a-zA-Z0-9][a-zA-Z0-9._\-]*$/;

export function isValidSha256Hex(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value.trim());
}

export function normalizeSha256Hex(value: string): string {
  return value.trim().toLowerCase();
}

/** Parse `publisher.extension` or reject. */
export function parsePublisherExtensionId(raw: unknown): { publisher: string; name: string; id: string } | null {
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  if (!id || id.length > 180 || !EXT_ID_RE.test(id)) return null;
  const dot = id.indexOf(".");
  if (dot <= 0 || dot === id.length - 1) return null;
  const publisher = id.slice(0, dot);
  const name = id.slice(dot + 1);
  if (!SEGMENT_RE.test(publisher) || !SEGMENT_RE.test(name)) return null;
  if (publisher.includes("..") || name.includes("..")) return null;
  return { publisher, name, id: `${publisher}.${name}` };
}

export function parseOpenVsxInstallInput(input: unknown): { namespace: string; name: string } | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const obj = input as Record<string, unknown>;
  // Reject any URL / base fields from renderer — even if also present with ids.
  for (const key of Object.keys(obj)) {
    const lower = key.toLowerCase();
    if (
      lower === "baseurl" ||
      lower === "downloadurl" ||
      lower === "url" ||
      lower === "uri" ||
      lower === "href" ||
      lower.endsWith("url")
    ) {
      return null;
    }
  }
  const namespace = typeof obj.namespace === "string" ? obj.namespace.trim() : "";
  const name = typeof obj.name === "string" ? obj.name.trim() : "";
  if (!SEGMENT_RE.test(namespace) || !SEGMENT_RE.test(name)) return null;
  if (namespace.length > 120 || name.length > 120) return null;
  return { namespace, name };
}

export function parseMarketplaceInstallInput(input: unknown): { extensionId: string } | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const obj = input as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    const lower = key.toLowerCase();
    if (
      lower === "baseurl" ||
      lower === "downloadurl" ||
      lower === "url" ||
      lower === "uri" ||
      lower === "href" ||
      lower.endsWith("url")
    ) {
      return null;
    }
  }
  const parsed = parsePublisherExtensionId(obj.extensionId);
  if (!parsed) return null;
  return { extensionId: parsed.id };
}

export function sanitizeExtensionFolderId(id: string): string {
  const cleaned = id.trim().replace(/[^a-zA-Z0-9._\-]/g, "_").slice(0, 120);
  if (!cleaned || cleaned === "." || cleaned === "..") {
    throw new Error("Invalid extension id");
  }
  return cleaned;
}
