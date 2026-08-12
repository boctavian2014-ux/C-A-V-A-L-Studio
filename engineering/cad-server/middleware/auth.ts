import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import type { CadAuthContext } from "../types";
import { cadUnauthorized } from "./errors";
import { isCadAnonymousAllowed } from "../boot-guard";

/**
 * Single verify secret. CAD_JWT_SECRET wins exclusively when set.
 * Never tries both secrets (that would be a JWT confusion attack).
 */
export const resolveCadJwtVerifySecret = (): string | undefined => {
  const cad = process.env.CAD_JWT_SECRET?.trim();
  if (cad) return cad;
  return process.env.SUPABASE_JWT_SECRET?.trim() || undefined;
};

interface VerifiedJwt {
  accountId: string;
}

const verifyBearerJwt = (request: Request): VerifiedJwt | "missing" | "invalid" => {
  const header = request.header("authorization");
  if (!header) return "missing";
  if (!header.startsWith("Bearer ")) return "invalid";
  const token = header.slice("Bearer ".length).trim();
  if (!token) return "invalid";

  const secret = resolveCadJwtVerifySecret();
  if (!secret) return "invalid";

  try {
    const payload = jwt.verify(token, secret, { algorithms: ["HS256"] }) as Record<string, unknown>;
    const accountId = typeof payload.sub === "string" ? payload.sub.trim() : "";
    if (!accountId) return "invalid";
    return { accountId };
  } catch {
    return "invalid";
  }
};

const buildAuth = (request: Request): CadAuthContext => {
  const expectedKey = process.env.CAD_API_KEY?.trim();
  if (expectedKey) {
    const provided = request.header("x-cad-api-key");
    if (provided !== expectedKey) {
      throw cadUnauthorized("Invalid CAD API key");
    }
  }

  const headerCavalId = request.header("x-caval-user-id")?.trim() || null;
  const jwtResult = verifyBearerJwt(request);

  if (jwtResult === "invalid") {
    throw cadUnauthorized("Invalid or missing Bearer JWT");
  }

  if (jwtResult !== "missing") {
    return {
      accountId: jwtResult.accountId,
      cavalId: jwtResult.accountId,
      userId: jwtResult.accountId,
      isService: Boolean(expectedKey),
      authClass: "jwt",
      headerCavalId,
    };
  }

  if (headerCavalId) {
    return {
      accountId: null,
      cavalId: headerCavalId,
      userId: null,
      isService: Boolean(expectedKey),
      authClass: "legacy",
      headerCavalId,
    };
  }

  if (!isCadAnonymousAllowed()) {
    throw cadUnauthorized("Missing Bearer JWT");
  }

  return {
    accountId: null,
    cavalId: "anonymous",
    userId: null,
    isService: Boolean(expectedKey),
    authClass: "anonymous",
    headerCavalId,
  };
};

export const requireCadAuth = (
  request: Request,
  _response: Response,
  next: NextFunction
): void => {
  try {
    request.cadAuth = buildAuth(request);
    next();
  } catch (error) {
    next(error);
  }
};

/** Profile contract: JWT.sub is the only accountId. Header never authorizes. */
export const requireJwtAccount = (
  request: Request,
  _response: Response,
  next: NextFunction
): void => {
  try {
    if (!request.cadAuth) request.cadAuth = buildAuth(request);
    if (request.cadAuth.authClass !== "jwt" || !request.cadAuth.accountId) {
      throw cadUnauthorized("Provider profiles require a verified JWT");
    }
    next();
  } catch (error) {
    next(error);
  }
};

/** Skip auth for health checks only. Header is telemetry, never authz. */
export const optionalCadAuth = (
  request: Request,
  _response: Response,
  next: NextFunction
): void => {
  const headerCavalId = request.header("x-caval-user-id")?.trim();
  if (headerCavalId) {
    request.cadAuth = {
      accountId: null,
      cavalId: headerCavalId,
      userId: null,
      isService: false,
      authClass: "legacy",
      headerCavalId,
    };
  }
  next();
};
