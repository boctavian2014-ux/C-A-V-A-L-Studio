import type { Request, Response, NextFunction } from "express";
import { planPrint3DRequest } from "../print3d-planner";
import { validateBody, planPrint3DSchema } from "../middleware/validate";
import { cadSafetyMiddleware } from "../middleware/safety";
import { cadLog } from "../middleware/logger";

export const planRouterHandlers = [
  validateBody(planPrint3DSchema),
  cadSafetyMiddleware,
  async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const body = request.body as {
        messages: Array<{ role: "user" | "assistant"; content: string }>;
        latestUserText: string;
        openRouterApiKey?: string;
        meshApiKey?: string;
        previousMeshTaskId?: string;
      };

      const result = await planPrint3DRequest({
        messages: body.messages ?? [],
        latestUserText: body.latestUserText.trim(),
        openRouterApiKey: body.openRouterApiKey,
        meshApiKey: body.meshApiKey,
        previousMeshTaskId: body.previousMeshTaskId,
      });

      if (!result.ok) {
        response.status(502).json({ ok: false, error: result.error ?? "Planner failed" });
        return;
      }

      cadLog({
        level: "info",
        event: "plan_created",
        cavalId: request.cadAuth?.cavalId,
      });
      response.json({ ok: true, plan: result.plan });
    } catch (error) {
      next(error);
    }
  },
];
