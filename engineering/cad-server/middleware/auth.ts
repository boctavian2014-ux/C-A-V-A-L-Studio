import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import type { CadAuthContext } from "../types";
import { cadUnauthorized } from "./errors";

const extractCavalIdFromJwt = (request: Request): string | null => {
  const header = request.header("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  if (!token) return null;

  const secret = process.env.CAD_JWT_SECRET ?? process.env.SUPABASE_JWT_SECRET;
  if (!secret) return null;

  try {
    const payload = jwt.verify(token, secret) as Record<string, unknown>;
    const cavalId =
      (typeof payload.caval_id === "string" && payload.caval_id) ||
      (typeof payload.sub === "string" && payload.sub) ||
      null;
    return cavalId;
  } catch {
    return null;
  }
};

export const requireCadAuth = (
  request: Request,
  _response: Response,
  next: NextFunction
): void => {
  try {
    const expectedKey = process.env.CAD_API_KEY?.trim();
    if (expectedKey) {
      const provided = request.header("x-cad-api-key");
      if (provided !== expectedKey) {
        throw cadUnauthorized("Invalid CAD API key");
      }
    }

    const headerCavalId = request.header("x-caval-user-id")?.trim();
    const jwtCavalId = extractCavalIdFromJwt(request);
    const cavalId = headerCavalId || jwtCavalId;

    if (!cavalId && process.env.CAD_ALLOW_ANONYMOUS !== "1") {
      throw cadUnauthorized("Missing user identity (x-caval-user-id or Bearer JWT)");
    }

    const auth: CadAuthContext = {
      cavalId: cavalId ?? "anonymous",
      userId: null,
      isService: Boolean(expectedKey),
    };
    request.cadAuth = auth;
    next();
  } catch (error) {
    next(error);
  }
};

/** Skip auth for health checks only. */
export const optionalCadAuth = (
  request: Request,
  _response: Response,
  next: NextFunction
): void => {
  const headerCavalId = request.header("x-caval-user-id")?.trim();
  if (headerCavalId) {
    request.cadAuth = { cavalId: headerCavalId, userId: null, isService: false };
  }
  next();
};
