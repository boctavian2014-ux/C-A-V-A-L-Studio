import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";

function timingSafeEqualString(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    // Compare against self to keep constant-ish work without leaking length via early return only.
    crypto.timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export const requireBillingAdmin = (request: Request, response: Response, next: NextFunction): void => {
  const expected = process.env.BILLING_ADMIN_KEY;
  if (!expected) {
    response.status(503).json({ ok: false, error: "BILLING_ADMIN_KEY not configured" });
    return;
  }
  const provided = request.header("x-billing-admin-key") ?? "";
  if (!timingSafeEqualString(provided, expected)) {
    response.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }
  next();
};

export const requireBillingApiKey = (request: Request, response: Response, next: NextFunction): void => {
  const expected = process.env.BILLING_API_KEY;
  if (!expected) {
    response.status(503).json({ ok: false, error: "BILLING_API_KEY not configured" });
    return;
  }
  const provided = request.header("x-billing-api-key") ?? "";
  if (!timingSafeEqualString(provided, expected)) {
    response.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }
  next();
};
