import type { Request, Response, NextFunction } from "express";

export const requireBillingAdmin = (request: Request, response: Response, next: NextFunction): void => {
  const expected = process.env.BILLING_ADMIN_KEY;
  if (!expected) {
    response.status(503).json({ ok: false, error: "BILLING_ADMIN_KEY not configured" });
    return;
  }
  const provided = request.header("x-billing-admin-key");
  if (provided !== expected) {
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
  const provided = request.header("x-billing-api-key");
  if (provided !== expected) {
    response.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }
  next();
};
