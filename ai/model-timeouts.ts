import type { ModelProviderId } from "./model-profiles";

export interface TimeoutPolicy {
  defaultTimeoutMs: number;
  providerTimeoutsMs: Record<ModelProviderId, number>;
  attemptBackoffMs: number[];
}

export const defaultTimeoutPolicy: TimeoutPolicy = {
  defaultTimeoutMs: 45_000,
  providerTimeoutsMs: {
    poolside: 70_000,
    openrouter: 45_000,
    nvidia: 55_000,
    north: 12_000,
    open_source: 90_000
  },
  attemptBackoffMs: [0, 500, 1_500]
};

export class ModelTimeouts {
  constructor(private readonly policy: TimeoutPolicy = defaultTimeoutPolicy) {}

  timeoutForProvider(provider: ModelProviderId, overrideMs?: number): number {
    return overrideMs ?? this.policy.providerTimeoutsMs[provider] ?? this.policy.defaultTimeoutMs;
  }

  backoffForAttempt(attempt: number): number {
    return this.policy.attemptBackoffMs[attempt] ?? this.policy.attemptBackoffMs.at(-1) ?? 0;
  }
}
