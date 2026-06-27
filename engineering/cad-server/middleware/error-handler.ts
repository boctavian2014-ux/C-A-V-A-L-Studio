import type { Request, Response, NextFunction } from "express";
import { CadHttpError } from "./errors";
import { cadLog } from "./logger";

export const cadErrorHandler = (
  error: unknown,
  request: Request,
  response: Response,
  _next: NextFunction
): void => {
  if (error instanceof CadHttpError) {
    cadLog({
      level: error.status >= 500 ? "error" : "warn",
      event: "http_error",
      cavalId: request.cadAuth?.cavalId,
      message: error.message,
      meta: { status: error.status, code: error.code, path: request.path },
    });
    response.status(error.status).json({ ok: false, error: error.message, code: error.code });
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  cadLog({
    level: "error",
    event: "unhandled_error",
    cavalId: request.cadAuth?.cavalId,
    message,
    meta: { path: request.path },
  });
  response.status(500).json({ ok: false, error: "Internal server error", code: "internal_error" });
};
