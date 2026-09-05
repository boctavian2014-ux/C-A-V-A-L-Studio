import {
  assertAllowedPreviewOpenUrl,
  isLoopbackHost,
  normalizePreviewUrl,
} from "./preview-security";
import type { PreviewTarget } from "./preview-types";

const VITE_LOCAL_RE = /\bLocal:\s*(https?:\/\/[^\s]+)/gi;
const NEXT_READY_RE =
  /\bready\s+-\s+started\s+server\s+on\s+(?:https?:\/\/)?([^\s:/]+|\[[^\]]+\]):(\d+)/gi;
const LOOPBACK_HTTP_RE =
  /(https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(?::\d+)?(?:\/[^\s]*)?)/gi;

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Normalizes preview dev URL:
 * - Keeps `localhost` as-is (Vite logs `http://localhost:...`)
 * - Rewrites `0.0.0.0` → `127.0.0.1`
 */
export function normalizePreviewLoopbackUrl(raw: string, target: PreviewTarget = "web"): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Preview URL is missing");
  }
  const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `http://${trimmed}`;
  const parsed = new URL(withProtocol);
  const host = parsed.hostname.replace(/^\[/, "").replace(/\]$/, "");
  if (!isLoopbackHost(host)) {
    throw new Error("Preview URL host is not a permitted loopback address");
  }
  if (host.toLowerCase() === "0.0.0.0") {
    parsed.hostname = "127.0.0.1";
  }
  return assertAllowedPreviewOpenUrl(normalizePreviewUrl(parsed.href), target);
}

function tryNormalizeCandidate(raw: string, target: PreviewTarget): string | undefined {
  try {
    return normalizePreviewLoopbackUrl(raw, target);
  } catch {
    return undefined;
  }
}

/**
 * Extract the dev-server URL from Vite/Next (or generic loopback) log output.
 * Returns the last match in the chunk (most recent ready line wins).
 */
export function extractDevServerUrlFromLog(
  text: string,
  target: PreviewTarget = "web"
): string | undefined {
  let candidate: string | undefined;

  for (const match of text.matchAll(VITE_LOCAL_RE)) {
    const normalized = tryNormalizeCandidate(match[1], target);
    if (normalized) candidate = normalized;
  }

  for (const match of text.matchAll(NEXT_READY_RE)) {
    const host = match[1].replace(/^\[/, "").replace(/\]$/, "");
    const port = match[2];
    const normalized = tryNormalizeCandidate(`http://${host}:${port}`, target);
    if (normalized) candidate = normalized;
  }

  for (const match of text.matchAll(LOOPBACK_HTTP_RE)) {
    const normalized = tryNormalizeCandidate(match[1], target);
    if (normalized) candidate = normalized;
  }

  return candidate ? stripTrailingSlash(candidate) : undefined;
}
