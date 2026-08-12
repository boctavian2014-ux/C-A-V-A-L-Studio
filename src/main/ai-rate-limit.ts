/**
 * Lot C5.4 — Local rate limits per senderId + workspace.
 * abort is never limited; start and resume use separate buckets.
 */

export type RateLimitKind = "stream_start" | "complete" | "resume";

export interface RateLimitResult {
  ok: boolean;
  retryAfterMs?: number;
  code?: "rate_limited_local";
}

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

const buckets = new Map<string, Bucket>();

const LIMITS: Record<RateLimitKind, { capacity: number; refillPerSec: number }> = {
  stream_start: { capacity: 8, refillPerSec: 0.25 }, // ~8 burst, ~15/min
  complete: { capacity: 12, refillPerSec: 0.4 },
  resume: { capacity: 4, refillPerSec: 0.1 },
};

function key(kind: RateLimitKind, senderId: number, workspaceRoot: string): string {
  return `${kind}:${senderId}:${workspaceRoot}`;
}

function refill(bucket: Bucket, capacity: number, refillPerSec: number, now: number): void {
  const elapsed = Math.max(0, now - bucket.lastRefillMs) / 1000;
  bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillPerSec);
  bucket.lastRefillMs = now;
}

export function resetAiRateLimitsForTests(): void {
  buckets.clear();
}

/** Abort must never be rate-limited. */
export function allowAiAbort(): RateLimitResult {
  return { ok: true };
}

export function consumeAiRateLimit(
  kind: RateLimitKind,
  senderId: number,
  workspaceRoot: string,
  now = Date.now()
): RateLimitResult {
  const cfg = LIMITS[kind];
  const k = key(kind, senderId, workspaceRoot.trim() || "_none_");
  let bucket = buckets.get(k);
  if (!bucket) {
    bucket = { tokens: cfg.capacity, lastRefillMs: now };
    buckets.set(k, bucket);
  }
  refill(bucket, cfg.capacity, cfg.refillPerSec, now);
  if (bucket.tokens < 1) {
    const retryAfterMs = Math.ceil(((1 - bucket.tokens) / cfg.refillPerSec) * 1000);
    return { ok: false, code: "rate_limited_local", retryAfterMs };
  }
  bucket.tokens -= 1;
  return { ok: true };
}
