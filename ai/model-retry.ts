import {
  isNeverRetryAuthError,
  isTransientRetryableError,
  toSafeProviderError,
} from "./providers/provider-errors";

export interface RetryDecision {
  retrySameModel: boolean;
  switchModel: boolean;
  switchProvider: boolean;
  reason: string;
}

/**
 * Lot C5.1 — Explicit retry policy:
 * - 401/403/invalid_api_key/malformed => never retry
 * - 429/timeout/5xx => limited backoff attempts
 */
export class ModelRetryPolicy {
  constructor(private readonly maxAttempts = 3) {}

  attempts(): number {
    return this.maxAttempts;
  }

  decide(error: unknown, attempt: number): RetryDecision {
    if (isNeverRetryAuthError(error)) {
      return {
        retrySameModel: false,
        switchModel: false,
        switchProvider: false,
        reason: "Authentication or malformed request — never retry.",
      };
    }

    const safe = toSafeProviderError(error);
    const retryable = isTransientRetryableError(safe);
    const down = /provider_unavailable|503|504|ENOTFOUND|ECONNREFUSED/i.test(
      `${safe.code} ${safe.message}`
    );

    if (!retryable || attempt >= this.maxAttempts - 1) {
      return {
        retrySameModel: false,
        switchModel: retryable,
        switchProvider: retryable,
        reason: retryable ? "Max retry attempts reached." : "Error is not retryable.",
      };
    }

    if (down) {
      return {
        retrySameModel: false,
        switchModel: true,
        switchProvider: true,
        reason: "Provider unavailable; switch provider/model.",
      };
    }

    if (attempt === 0) {
      return {
        retrySameModel: true,
        switchModel: false,
        switchProvider: false,
        reason: "Transient error; retry same model once.",
      };
    }

    return {
      retrySameModel: false,
      switchModel: true,
      switchProvider: false,
      reason: "Second-level retry switches model within the same routing set.",
    };
  }
}
