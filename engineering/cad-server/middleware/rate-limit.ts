import type { Request, Response, NextFunction } from "express";
import { cadLog } from "./logger";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

const windowMs = (): number =>
  Number(process.env.CAD_RATE_LIMIT_WINDOW_MS ?? 60_000);

const maxRequests = (): number =>
  Number(process.env.CAD_RATE_LIMIT_MAX ?? 30);

const bucketKey = (request: Request): string => {
  const cavalId = request.cadAuth?.cavalId ?? "anonymous";
  const ip = request.ip ?? request.socket.remoteAddress ?? "unknown";
  return `${cavalId}:${ip}`;
};

export const cadRateLimitMiddleware = (
  request: Request,
  response: Response,
  next: NextFunction
): void => {
  const key = bucketKey(request);
  const now = Date.now();
  const window = windowMs();
  const max = maxRequests();

  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + window };
    buckets.set(key, bucket);
  }

  bucket.count += 1;
  if (bucket.count > max) {
    cadLog({
      level: "warn",
      event: "rate_limit_exceeded",
      cavalId: request.cadAuth?.cavalId,
      meta: { key, count: bucket.count, max },
    });
    response.status(429).json({
      ok: false,
      error: "Rate limit exceeded. Try again shortly.",
    });
    return;
  }

  next();
};

/** Test helper — clears in-memory buckets. */
export const resetCadRateLimitsForTests = (): void => {
  buckets.clear();
};
