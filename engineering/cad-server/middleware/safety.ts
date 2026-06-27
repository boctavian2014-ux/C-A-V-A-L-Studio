import { SafetyGuard } from "../../../ai/safety/guard";
import type { Request, Response, NextFunction } from "express";
import { cadBadRequest } from "./errors";
import { cadLog } from "./logger";

const guard = new SafetyGuard();

export const cadSafetyMiddleware = (
  request: Request,
  _response: Response,
  next: NextFunction
): void => {
  try {
    const body = request.body as { prompt?: string; latestUserText?: string };
    const prompt = (body.prompt ?? body.latestUserText ?? "").trim();
    if (!prompt) {
      next();
      return;
    }

    guard.assertRequestAllowed({
      prompt,
      capability: "planning",
      intent: "planning",
      metadata: { workspaceRoot: request.cadAuth?.cavalId },
      messages: [{ role: "user", content: prompt }],
    });
    next();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    cadLog({
      level: "warn",
      event: "safety_blocked",
      cavalId: request.cadAuth?.cavalId,
      message,
    });
    next(cadBadRequest(message));
  }
};
