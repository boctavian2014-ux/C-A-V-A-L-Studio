import type { Request, Response, NextFunction } from "express";
import { CadHttpError } from "./errors";
import { cadLog } from "./logger";
import { redactSensitiveText } from "../../../src/shared/command-output-redaction";

export const cadErrorHandler = (
  error: unknown,
  request: Request,
  response: Response,
  _next: NextFunction
): void => {
  if (error instanceof CadHttpError) {
    const message = redactSensitiveText(error.message);
    cadLog({
      level: error.status >= 500 ? "error" : "warn",
      event: "http_error",
      cavalId: request.cadAuth?.cavalId,
      accountId: request.cadAuth?.accountId ?? undefined,
      message,
      meta: { status: error.status, code: error.code, path: request.path },
    });
    response.status(error.status).json({ ok: false, error: message, code: error.code });
    return;
  }

  const message = redactSensitiveText(
    error instanceof Error ? error.message : String(error)
  );
  cadLog({
    level: "error",
    event: "unhandled_error",
    cavalId: request.cadAuth?.cavalId,
    accountId: request.cadAuth?.accountId ?? undefined,
    message,
    meta: { path: request.path },
  });
  response.status(500).json({ ok: false, error: "Internal server error", code: "internal_error" });
};
