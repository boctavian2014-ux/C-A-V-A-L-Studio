import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export interface AuthenticatedUser {
  id: string;
  cavalId?: string;
  email?: string;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthenticatedUser;
  }
}

const getJwtSecret = (): string => {
  const secret = process.env.CAVAL_MARKETPLACE_JWT_SECRET;
  if (!secret) {
    throw new Error("CAVAL_MARKETPLACE_JWT_SECRET is required for authenticated routes.");
  }
  return secret;
};

export const requireAuth = (request: Request, response: Response, next: NextFunction): void => {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    response.status(401).json({ error: "Authorization Bearer token required." });
    return;
  }

  try {
    const decoded = jwt.verify(header.slice(7), getJwtSecret()) as AuthenticatedUser;
    request.user = decoded;
    next();
  } catch {
    response.status(401).json({ error: "Invalid or expired token." });
  }
};
