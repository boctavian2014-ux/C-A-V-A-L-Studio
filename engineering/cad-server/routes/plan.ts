import type { Request, Response, NextFunction } from "express";
import { planPrint3DRequest } from "../print3d-planner";
import { validateBody, planPrint3DSchema } from "../middleware/validate";
import { cadSafetyMiddleware } from "../middleware/safety";
import { cadRateLimitMiddleware } from "../middleware/rate-limit";
import { cadLog } from "../middleware/logger";
import { attachResolvedCadSecrets } from "../services/cad-secret-resolve";

export const planRouterHandlers = [
  cadRateLimitMiddleware,
  validateBody(planPrint3DSchema),
  cadSafetyMiddleware,
  async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const body = request.body as {
        messages: Array<{ role: "user" | "assistant"; content: string }>;
        latestUserText: string;
        openRouterApiKey?: string;
        meshApiKey?: string;
        piapiApiKey?: string;
        providerProfileId?: string;
        previousMeshTaskId?: string;
      };

      const secured = (await attachResolvedCadSecrets(
        request,
        body as unknown as Record<string, unknown> & { providerProfileId?: string }
      )) as typeof body;

      const result = await planPrint3DRequest({
        messages: secured.messages ?? [],
        latestUserText: (secured.latestUserText ?? body.latestUserText).trim(),
        openRouterApiKey: secured.openRouterApiKey,
        meshApiKey: secured.meshApiKey,
        piapiApiKey: secured.piapiApiKey,
        previousMeshTaskId: secured.previousMeshTaskId,
      });

      if (!result.ok) {
        response.status(502).json({ ok: false, error: result.error ?? "Planner failed" });
        return;
      }

      cadLog({
        level: "info",
        event: "plan_created",
        cavalId: request.cadAuth?.cavalId,
        accountId: request.cadAuth?.accountId ?? undefined,
        requestClass: body.providerProfileId ? "profile" : "legacy",
      });
      response.json({ ok: true, plan: result.plan });
    } catch (error) {
      next(error);
    }
  },
];
