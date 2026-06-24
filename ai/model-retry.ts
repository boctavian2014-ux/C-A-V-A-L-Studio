export interface RetryDecision {
  retrySameModel: boolean;
  switchModel: boolean;
  switchProvider: boolean;
  reason: string;
}

export class ModelRetryPolicy {
  constructor(private readonly maxAttempts = 3) {}

  attempts(): number {
    return this.maxAttempts;
  }

  decide(error: unknown, attempt: number): RetryDecision {
    const message = error instanceof Error ? error.message : String(error);
    const retryable = /429|500|502|503|504|timeout|aborted|ECONNRESET|ETIMEDOUT/i.test(message);
    const down = /503|504|ENOTFOUND|ECONNREFUSED|model.*down|provider.*down/i.test(message);

    if (!retryable || attempt >= this.maxAttempts - 1) {
      return {
        retrySameModel: false,
        switchModel: true,
        switchProvider: true,
        reason: retryable ? "Max retry attempts reached." : "Error is not retryable."
      };
    }

    if (down) {
      return {
        retrySameModel: false,
        switchModel: true,
        switchProvider: true,
        reason: "Provider or model appears down; switch provider/model."
      };
    }

    if (attempt === 0) {
      return {
        retrySameModel: true,
        switchModel: false,
        switchProvider: false,
        reason: "Transient error; retry same model once."
      };
    }

    return {
      retrySameModel: false,
      switchModel: true,
      switchProvider: false,
      reason: "Second-level retry switches model within the same routing set."
    };
  }
}
