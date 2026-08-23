/**
 * Renderer-safe CAD transport errors — no hosts, URLs, or upstream messages.
 */

export type CadTransportErrorContext = "job" | "plan" | "cancel" | "logs";

const UNREACHABLE_CLOUD =
  "CAD cloud service is unreachable. Check Settings → CAD Cloud and try again.";
const UNREACHABLE_LOCAL =
  "CAD service is unreachable. Check Settings → CAD Cloud or start local CAD (npm run cad:serve).";
const TIMEOUT =
  "CAD service request timed out. Check your network connection and try again.";
const BLOCKED = "CAD request was blocked by security policy.";
const INVALID_RESPONSE = "CAD service returned an invalid response.";

type NetworkGuardLike = {
  name: string;
  reason: string;
};

function isNetworkGuardError(error: unknown): error is NetworkGuardLike {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as NetworkGuardLike).name === "NetworkGuardError" &&
    typeof (error as NetworkGuardLike).reason === "string"
  );
}

function unreachableMessage(cloudOnly: boolean): string {
  return cloudOnly ? UNREACHABLE_CLOUD : UNREACHABLE_LOCAL;
}

/** Maps HTTP status to a generic, actionable message — never forwards upstream body text. */
export function mapCadHttpFailure(
  status: number,
  context: CadTransportErrorContext = "job"
): string {
  if (status === 401 || status === 403) {
    return "CAD service authentication failed. Check API keys in Settings.";
  }
  if (status === 404) {
    return context === "cancel"
      ? "CAD job could not be found for cancel."
      : context === "logs"
        ? "CAD job logs were not found."
        : "CAD job or resource was not found.";
  }
  if (status === 429) {
    return "CAD service rate limit exceeded. Try again later.";
  }
  if (status >= 500) {
    return "CAD service is temporarily unavailable. Try again later.";
  }
  if (context === "plan") {
    return "CAD plan request failed. Try again or check Settings.";
  }
  if (context === "logs") {
    return "CAD job logs could not be loaded. Try again later.";
  }
  if (context === "cancel") {
    return "CAD job cancel failed. Try again later.";
  }
  return "CAD service rejected the request. Try again or check Settings.";
}

export function cadTransportErrorMessage(
  error: unknown,
  options: { cloudOnly?: boolean } = {}
): string {
  const cloudOnly = options.cloudOnly ?? true;

  if (isNetworkGuardError(error)) {
    switch (error.reason) {
      case "timeout":
        return TIMEOUT;
      case "size":
      case "content_type":
        return INVALID_RESPONSE;
      case "host":
      case "scheme":
      case "credentials":
      case "private_ip":
      case "dns":
      case "redirect":
      case "redirect_limit":
      case "invalid_url":
        return BLOCKED;
      default:
        return BLOCKED;
    }
  }

  if (error instanceof SyntaxError) {
    return INVALID_RESPONSE;
  }

  return unreachableMessage(cloudOnly);
}

export function mapCadTransportError(
  error: unknown,
  options: { cloudOnly?: boolean } = {}
): { ok: false; error: string } {
  return { ok: false, error: cadTransportErrorMessage(error, options) };
}

/** Test helper — detects host/URL leaks in IPC error strings. */
export function containsCadTransportLeak(text: string, configuredHost?: string): boolean {
  if (/https?:\/\//i.test(text)) return true;
  if (/railway\.app/i.test(text)) return true;
  if (configuredHost?.trim() && text.includes(configuredHost.trim())) return true;
  return false;
}
