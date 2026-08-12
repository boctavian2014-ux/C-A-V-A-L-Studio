/**
 * Lot C4 — centralized external URL policy for shell.openExternal / navigation.
 * Single source of truth: do not duplicate validators elsewhere.
 */
import { app, dialog, shell } from "electron";

export type ExternalUrlOrigin =
  | "INTERNAL_CONSTANT"
  | "USER_INITIATED_TRUSTED"
  | "EXTERNAL_CONTENT";

export const EXTERNAL_URL_ORIGINS: readonly ExternalUrlOrigin[] = [
  "INTERNAL_CONSTANT",
  "USER_INITIATED_TRUSTED",
  "EXTERNAL_CONTENT",
] as const;

/** Hosts trusted for INTERNAL_CONSTANT / USER_INITIATED_TRUSTED auto-open. */
export const CAVALLO_TRUSTED_HOSTS = ["caval.studio", "www.caval.studio", "docs.caval.studio"];

export const STRIPE_CHECKOUT_HOSTS = [
  "checkout.stripe.com",
  "billing.stripe.com",
  "pay.stripe.com",
];

export const OPENVSX_DOC_HOSTS = ["open-vsx.org", "www.open-vsx.org"];

const SENSITIVE_QUERY_KEYS = new Set([
  "token",
  "key",
  "api_key",
  "apikey",
  "code",
  "state",
  "signature",
  "client_secret",
  "session_id",
  "access_token",
  "refresh_token",
  "id_token",
]);

const BLOCKED_SCHEMES = new Set([
  "file:",
  "javascript:",
  "data:",
  "vbscript:",
  "blob:",
  "ftp:",
  "about:",
  "ws:",
  "wss:",
]);

export type ExternalUrlDecision = "allow" | "confirm" | "deny";

export interface ExternalUrlEvaluation {
  decision: ExternalUrlDecision;
  reason?: string;
  parsed?: URL;
  hostname?: string;
  displayUrl?: string;
  allowlisted: boolean;
}

export interface OpenExternalUrlOptions {
  origin: ExternalUrlOrigin;
  /** Extra / replacement allowlist for this call (e.g. Stripe). */
  allowedHosts?: string[];
  /** Override production detection (tests). Default: app.isPackaged when available. */
  isProduction?: boolean;
  /** Injected confirm dialog (tests). */
  confirm?: (info: {
    hostname: string;
    displayUrl: string;
    origin: ExternalUrlOrigin;
    allowlisted: boolean;
  }) => Promise<boolean>;
  /** Injected open (tests). */
  openExternal?: (url: string) => Promise<void>;
  /** Logger for blocked / redacted events. */
  log?: (message: string) => void;
}

function defaultIsProduction(): boolean {
  try {
    return typeof app?.isPackaged === "boolean" ? app.isPackaged : process.env.NODE_ENV === "production";
  } catch {
    return process.env.NODE_ENV === "production";
  }
}

export function isExternalUrlOrigin(value: unknown): value is ExternalUrlOrigin {
  return typeof value === "string" && (EXTERNAL_URL_ORIGINS as readonly string[]).includes(value);
}

export function hostMatchesAllowlist(hostname: string, allowedHosts: string[]): boolean {
  const host = hostname.toLowerCase();
  return allowedHosts.some((entry) => {
    const allowed = entry.toLowerCase();
    return host === allowed || host.endsWith(`.${allowed}`);
  });
}

/** ASCII hostname only — reject IDN / punycode until explicit IDN UX exists. */
export function isDisallowedHostname(hostname: string): boolean {
  if (!hostname || hostname.length === 0) return true;
  if (hostname.includes("..")) return true;
  if (/[\u0080-\uffff]/.test(hostname)) return true; // non-ASCII / IDN
  if (hostname.toLowerCase().includes("xn--")) return true; // punycode
  if (!/^[a-z0-9.-]+$/i.test(hostname) && hostname !== "localhost") {
    // Allow IPv4 literals
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return true;
  }
  return false;
}

export function redactUrlForDisplay(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "[invalid-url]";
  }
  const originAndPath = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  const parts: string[] = [];
  for (const [key, value] of parsed.searchParams.entries()) {
    if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
      parts.push(`${encodeURIComponent(key)}=[REDACTED]`);
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    }
  }
  const query = parts.length > 0 ? `?${parts.join("&")}` : "";
  const hash = parsed.hash || "";
  return `${originAndPath}${query}${hash}`;
}

/**
 * Parse + scheme/host rules. Does not decide confirm vs allow.
 */
export function parseExternalUrl(
  url: string,
  opts?: { isProduction?: boolean }
): { ok: true; parsed: URL } | { ok: false; reason: string } {
  if (typeof url !== "string" || !url.trim()) {
    return { ok: false, reason: "empty_url" };
  }
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return { ok: false, reason: "malformed_url" };
  }

  const protocol = parsed.protocol.toLowerCase();
  if (BLOCKED_SCHEMES.has(protocol)) {
    return { ok: false, reason: `blocked_scheme:${protocol}` };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, reason: "credentials_forbidden" };
  }

  if (!parsed.hostname) {
    return { ok: false, reason: "missing_hostname" };
  }

  if (isDisallowedHostname(parsed.hostname)) {
    return { ok: false, reason: "hostname_idn_or_ambiguous" };
  }

  const isProduction = opts?.isProduction ?? defaultIsProduction();
  const host = parsed.hostname.toLowerCase();
  const isLocalLoopback = host === "localhost" || host === "127.0.0.1";

  if (protocol === "https:") {
    return { ok: true, parsed };
  }

  if (protocol === "http:") {
    if (!isProduction && isLocalLoopback) {
      return { ok: true, parsed };
    }
    return { ok: false, reason: isProduction ? "http_forbidden_in_production" : "http_external_forbidden" };
  }

  return { ok: false, reason: `blocked_scheme:${protocol}` };
}

export function evaluateExternalUrl(
  url: string,
  origin: ExternalUrlOrigin,
  opts?: { isProduction?: boolean; allowedHosts?: string[] }
): ExternalUrlEvaluation {
  const parsedResult = parseExternalUrl(url, { isProduction: opts?.isProduction });
  if (!parsedResult.ok) {
    return {
      decision: "deny",
      reason: parsedResult.reason,
      allowlisted: false,
      displayUrl: redactUrlForDisplay(url),
    };
  }

  const { parsed } = parsedResult;
  const defaultHosts = [...CAVALLO_TRUSTED_HOSTS, ...STRIPE_CHECKOUT_HOSTS, ...OPENVSX_DOC_HOSTS];
  const allowedHosts = opts?.allowedHosts?.length ? opts.allowedHosts : defaultHosts;
  const allowlisted = hostMatchesAllowlist(parsed.hostname, allowedHosts);
  const displayUrl = redactUrlForDisplay(parsed.toString());

  if (origin === "EXTERNAL_CONTENT") {
    // Never auto-open AI/Markdown/renderer content — even on allowlisted hosts.
    return {
      decision: "confirm",
      parsed,
      hostname: parsed.hostname,
      displayUrl,
      allowlisted,
      reason: allowlisted ? "external_content_requires_confirm" : "unknown_host_requires_confirm",
    };
  }

  if (origin === "INTERNAL_CONSTANT" || origin === "USER_INITIATED_TRUSTED") {
    if (allowlisted) {
      return {
        decision: "allow",
        parsed,
        hostname: parsed.hostname,
        displayUrl,
        allowlisted: true,
      };
    }
    return {
      decision: "confirm",
      parsed,
      hostname: parsed.hostname,
      displayUrl,
      allowlisted: false,
      reason: "unknown_host_requires_confirm",
    };
  }

  return { decision: "deny", reason: "unknown_origin", allowlisted: false, displayUrl };
}

async function defaultConfirm(info: {
  hostname: string;
  displayUrl: string;
  origin: ExternalUrlOrigin;
  allowlisted: boolean;
}): Promise<boolean> {
  const warning =
    info.origin === "EXTERNAL_CONTENT"
      ? "Acest link poate proveni din AI, Markdown sau conținut extern. Deschide doar dacă ai încredere în sursă."
      : "Deschizi acest link extern în browserul sistemului?";
  const choice = await dialog.showMessageBox({
    type: "warning",
    buttons: ["Open externally", "Cancel"],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
    message: `Deschizi ${info.hostname}?`,
    detail: `${warning}\n\n${info.displayUrl}`,
  });
  return choice.response === 0;
}

/**
 * Open an external URL after policy. Calls shell.openExternal only when allowed/confirmed.
 */
export async function openExternalUrl(
  url: string,
  options: OpenExternalUrlOptions
): Promise<{ ok: boolean; error?: string; opened?: boolean }> {
  const log = options.log ?? ((msg: string) => console.warn(`[external-url-policy] ${msg}`));
  const evaluation = evaluateExternalUrl(url, options.origin, {
    isProduction: options.isProduction,
    allowedHosts: options.allowedHosts,
  });

  if (evaluation.decision === "deny") {
    log(`blocked reason=${evaluation.reason} display=${evaluation.displayUrl ?? redactUrlForDisplay(url)}`);
    return { ok: false, error: "URL blocked by security policy.", opened: false };
  }

  if (evaluation.decision === "confirm") {
    const confirm = options.confirm ?? defaultConfirm;
    const accepted = await confirm({
      hostname: evaluation.hostname ?? "unknown",
      displayUrl: evaluation.displayUrl ?? redactUrlForDisplay(url),
      origin: options.origin,
      allowlisted: evaluation.allowlisted,
    });
    if (!accepted) {
      log(`confirm_cancelled host=${evaluation.hostname} display=${evaluation.displayUrl}`);
      return { ok: false, error: "Anulat de utilizator.", opened: false };
    }
  }

  const open = options.openExternal ?? ((u: string) => shell.openExternal(u));
  try {
    // Open the real URL (unredacted); only logs/UI used the redacted form.
    await open(evaluation.parsed?.toString() ?? url);
    return { ok: true, opened: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log(`open_failed display=${evaluation.displayUrl} err=${message}`);
    return { ok: false, error: message, opened: false };
  }
}

/** Whether a URL is safe to render as an href hint (no open). */
export function isRenderableExternalHref(url: string, opts?: { isProduction?: boolean }): boolean {
  return parseExternalUrl(url, opts).ok;
}

/** Workbench navigation: only local app protocols. */
export function isAllowedWorkbenchNavigation(navigationUrl: string): boolean {
  try {
    const parsed = new URL(navigationUrl);
    return parsed.protocol === "file:" || parsed.protocol === "app:" || parsed.protocol === "caval:";
  } catch {
    return false;
  }
}

/** @deprecated Use evaluateExternalUrl / parseExternalUrl — thin compat wrapper. */
export function isSafeExternalUrl(url: string, allowedHosts?: string[]): boolean {
  const parsed = parseExternalUrl(url);
  if (!parsed.ok) return false;
  if (allowedHosts && allowedHosts.length > 0) {
    return hostMatchesAllowlist(parsed.parsed.hostname, allowedHosts);
  }
  return true;
}

/** @deprecated Prefer openExternalUrl with explicit origin. */
export async function openSafeExternalUrl(
  url: string,
  allowedHosts?: string[]
): Promise<{ ok: boolean; error?: string }> {
  return openExternalUrl(url, {
    origin: "USER_INITIATED_TRUSTED",
    allowedHosts: allowedHosts?.length ? allowedHosts : undefined,
  });
}
