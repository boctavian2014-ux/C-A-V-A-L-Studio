/**
 * Per-provider circuit breaker (closed / open / half-open).
 * Used for NVIDIA NIM ↔ Ollama failover — never logs API keys.
 */

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerOptions {
  failureThreshold: number;
  cooldownMs: number;
  now?: () => number;
}

export interface CircuitSnapshot {
  providerId: string;
  state: CircuitState;
  failureCount: number;
  cooldownRemainingMs: number;
  openedAt?: number;
}

interface CircuitEntry {
  state: CircuitState;
  failureCount: number;
  openedUntil: number;
  halfOpenProbeInFlight: boolean;
}

function defaultNow(): number {
  return Date.now();
}

/** Parse HTTP Retry-After (delta-seconds or HTTP-date). Returns ms, or undefined. */
export function parseRetryAfterMs(header: string | null | undefined, now = defaultNow()): number | undefined {
  const raw = header?.trim();
  if (!raw) return undefined;
  if (/^\d+$/.test(raw)) {
    const seconds = Number(raw);
    if (!Number.isFinite(seconds) || seconds < 0) return undefined;
    return Math.floor(seconds * 1000);
  }
  const dateMs = Date.parse(raw);
  if (!Number.isFinite(dateMs)) return undefined;
  const delta = dateMs - now;
  return delta > 0 ? delta : 0;
}

export function isCircuitTripError(error: unknown): boolean {
  if (error && typeof error === "object" && "code" in error) {
    const code = String((error as { code?: string }).code);
    if (code === "rate_limited" || code === "request_timeout" || code === "provider_unavailable") {
      return true;
    }
  }
  const message = error instanceof Error ? error.message : String(error);
  return /429|timeout|ETIMEDOUT|ECONNREFUSED|ECONNRESET|ENOTFOUND|aborted/i.test(message);
}

export class ProviderCircuitBreaker {
  private readonly entries = new Map<string, CircuitEntry>();
  private readonly now: () => number;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;

  constructor(options: CircuitBreakerOptions) {
    this.failureThreshold = Math.max(1, options.failureThreshold);
    this.cooldownMs = Math.max(0, options.cooldownMs);
    this.now = options.now ?? defaultNow;
  }

  allowRequest(providerId: string): boolean {
    const entry = this.ensure(providerId);
    this.maybeExpireOpen(providerId, entry);
    if (entry.state === "closed") return true;
    if (entry.state === "open") return false;
    if (entry.state === "half-open") {
      if (entry.halfOpenProbeInFlight) return false;
      entry.halfOpenProbeInFlight = true;
      return true;
    }
    return false;
  }

  recordSuccess(providerId: string): void {
    this.entries.set(providerId, {
      state: "closed",
      failureCount: 0,
      openedUntil: 0,
      halfOpenProbeInFlight: false,
    });
  }

  recordFailure(providerId: string, info?: { retryAfterMs?: number }): void {
    const entry = this.ensure(providerId);
    const now = this.now();
    const extraCooldown = info?.retryAfterMs && info.retryAfterMs > 0 ? info.retryAfterMs : 0;

    if (entry.state === "half-open") {
      entry.state = "open";
      entry.failureCount = this.failureThreshold;
      entry.openedUntil = now + Math.max(this.cooldownMs, extraCooldown);
      entry.halfOpenProbeInFlight = false;
      return;
    }

    entry.failureCount += 1;
    entry.halfOpenProbeInFlight = false;
    if (entry.failureCount >= this.failureThreshold) {
      entry.state = "open";
      entry.openedUntil = now + Math.max(this.cooldownMs, extraCooldown);
    }
  }

  getState(providerId: string): CircuitState {
    const entry = this.ensure(providerId);
    this.maybeExpireOpen(providerId, entry);
    return entry.state;
  }

  getCooldownRemainingMs(providerId: string): number {
    const entry = this.ensure(providerId);
    this.maybeExpireOpen(providerId, entry);
    if (entry.state !== "open") return 0;
    return Math.max(0, entry.openedUntil - this.now());
  }

  snapshot(providerId: string): CircuitSnapshot {
    const entry = this.ensure(providerId);
    this.maybeExpireOpen(providerId, entry);
    return {
      providerId,
      state: entry.state,
      failureCount: entry.failureCount,
      cooldownRemainingMs: this.getCooldownRemainingMs(providerId),
      openedAt: entry.state === "open" ? entry.openedUntil - Math.max(this.cooldownMs, 0) : undefined,
    };
  }

  reset(providerId?: string): void {
    if (providerId) this.entries.delete(providerId);
    else this.entries.clear();
  }

  private ensure(providerId: string): CircuitEntry {
    let entry = this.entries.get(providerId);
    if (!entry) {
      entry = {
        state: "closed",
        failureCount: 0,
        openedUntil: 0,
        halfOpenProbeInFlight: false,
      };
      this.entries.set(providerId, entry);
    }
    return entry;
  }

  private maybeExpireOpen(providerId: string, entry: CircuitEntry): void {
    if (entry.state !== "open") return;
    if (this.now() < entry.openedUntil) return;
    entry.state = "half-open";
    entry.halfOpenProbeInFlight = false;
  }
}

const breakers = new Map<string, ProviderCircuitBreaker>();

export function getSharedCircuitBreaker(
  key: string,
  options: CircuitBreakerOptions
): ProviderCircuitBreaker {
  const existing = breakers.get(key);
  if (existing) return existing;
  const created = new ProviderCircuitBreaker(options);
  breakers.set(key, created);
  return created;
}

export function resetSharedCircuitBreakers(): void {
  breakers.clear();
}
