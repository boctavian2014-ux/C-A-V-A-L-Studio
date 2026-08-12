/**
 * Lot C5.1 — Safe provider error codes for logs/UI (never raw response bodies).
 */
import { redactSensitiveText } from "../../src/shared/command-output-redaction";

export type ProviderErrorCode =
  | "auth_failed"
  | "rate_limited"
  | "provider_unavailable"
  | "request_timeout"
  | "provider_error"
  | "malformed_request"
  | "invalid_api_key"
  | "host_blocked"
  | "rate_limited_local";

export class SafeProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly httpStatus?: number;
  readonly retryable: boolean;

  constructor(code: ProviderErrorCode, message: string, opts?: { httpStatus?: number; retryable?: boolean }) {
    super(redactSensitiveText(message));
    this.name = "SafeProviderError";
    this.code = code;
    this.httpStatus = opts?.httpStatus;
    this.retryable = opts?.retryable ?? false;
  }
}

export function mapHttpStatusToProviderCode(status: number): ProviderErrorCode {
  if (status === 401 || status === 403) return "auth_failed";
  if (status === 400 || status === 422) return "malformed_request";
  if (status === 429) return "rate_limited";
  if (status === 408) return "request_timeout";
  if (status >= 500) return "provider_unavailable";
  return "provider_error";
}

export function isNeverRetryAuthError(error: unknown): boolean {
  if (error instanceof SafeProviderError) {
    return (
      error.code === "auth_failed" ||
      error.code === "invalid_api_key" ||
      error.code === "malformed_request" ||
      error.httpStatus === 401 ||
      error.httpStatus === 403
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  return /401|403|invalid[_ ]?api[_ ]?key|auth_failed|malformed_request|unauthorized|forbidden/i.test(
    message
  );
}

export function isTransientRetryableError(error: unknown): boolean {
  if (isNeverRetryAuthError(error)) return false;
  if (error instanceof SafeProviderError) {
    return error.retryable || error.code === "rate_limited" || error.code === "provider_unavailable" || error.code === "request_timeout";
  }
  const message = error instanceof Error ? error.message : String(error);
  return /429|500|502|503|504|timeout|aborted|ECONNRESET|ETIMEDOUT|provider_unavailable|rate_limited/i.test(
    message
  );
}

/** Map a failed HTTP response to SafeProviderError — never attach raw body. */
export function safeErrorFromHttpStatus(
  providerName: string,
  status: number,
  _rawBodyIgnored?: string
): SafeProviderError {
  const code = mapHttpStatusToProviderCode(status);
  if (status === 401 || status === 403) {
    return new SafeProviderError("auth_failed", `${providerName} authentication failed`, {
      httpStatus: status,
      retryable: false,
    });
  }
  if (code === "rate_limited") {
    return new SafeProviderError("rate_limited", `${providerName} rate limited`, {
      httpStatus: status,
      retryable: true,
    });
  }
  if (code === "provider_unavailable") {
    return new SafeProviderError("provider_unavailable", `${providerName} unavailable (${status})`, {
      httpStatus: status,
      retryable: true,
    });
  }
  if (code === "malformed_request") {
    return new SafeProviderError("malformed_request", `${providerName} rejected the request`, {
      httpStatus: status,
      retryable: false,
    });
  }
  return new SafeProviderError("provider_error", `${providerName} error (${status})`, {
    httpStatus: status,
    retryable: false,
  });
}

export function toSafeProviderError(error: unknown, fallbackProvider = "provider"): SafeProviderError {
  if (error instanceof SafeProviderError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (/timeout|aborted|ETIMEDOUT/i.test(message)) {
    return new SafeProviderError("request_timeout", `${fallbackProvider} request timed out`, {
      retryable: true,
    });
  }
  if (isNeverRetryAuthError(error)) {
    return new SafeProviderError("auth_failed", `${fallbackProvider} authentication failed`, {
      retryable: false,
    });
  }
  if (/429|rate[_ ]?limit/i.test(message)) {
    return new SafeProviderError("rate_limited", `${fallbackProvider} rate limited`, {
      httpStatus: 429,
      retryable: true,
    });
  }
  if (isTransientRetryableError(error)) {
    return new SafeProviderError("provider_unavailable", `${fallbackProvider} temporarily unavailable`, {
      retryable: true,
    });
  }
  return new SafeProviderError("provider_error", redactSensitiveText(`${fallbackProvider} error`), {
    retryable: false,
  });
}

const IPC_SECURITY_ERROR =
  /Untrusted IPC sender|Cross-sender|Cross-workspace|No workspace open|Deschide un folder/i;

export function safeErrorMessageForUi(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (IPC_SECURITY_ERROR.test(raw)) {
    return redactSensitiveText(raw);
  }
  const safe = toSafeProviderError(error);
  return redactSensitiveText(`${safe.code}: ${safe.message}`);
}
