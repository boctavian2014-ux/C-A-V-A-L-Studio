export type ZeroLatencyDraftPlanMode = 'off' | 'stub' | 'fast' | 'fast-then-frontier';

export interface ZeroLatencyConfig {
  enabled: boolean;
  typingDebounceMs: number;
  frontierPrewarm: boolean;
  draftPlan: ZeroLatencyDraftPlanMode;
  maxWarmFiles: number;
  maxWarmChars: number;
}

export const DEFAULT_ZERO_LATENCY_CONFIG: ZeroLatencyConfig = {
  enabled: true,
  typingDebounceMs: 500,
  frontierPrewarm: true,
  draftPlan: 'stub',
  maxWarmFiles: 16,
  maxWarmChars: 8000,
};

export function isFrontierSelection(model: string): boolean {
  return model === 'caval-auto/frontier' || model === 'nex-n2-pro';
}
