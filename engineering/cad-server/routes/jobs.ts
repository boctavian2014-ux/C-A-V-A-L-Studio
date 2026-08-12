import type { Request, Response, NextFunction } from "express";
import {
  assertJobOwnership,
  getCadJob,
} from "../storage/index";
import {
  enqueueCadJob,
  cancelCadJobProcessing,
  getLocalStlBuffer,
} from "../job-processor";
import { buildCadJobResult, toCadJobPublicView } from "../services/job-result";
import { getJobLogs } from "../services/job-logger";
import {
  validateBody,
  validateParams,
  createCadJobSchema,
  jobIdParamSchema,
} from "../middleware/validate";
import { cadSafetyMiddleware } from "../middleware/safety";
import { cadRateLimitMiddleware } from "../middleware/rate-limit";
import { cadForbidden, cadNotFound } from "../middleware/errors";
import { cadLog } from "../middleware/logger";
import type { CreateCadJobInput } from "../types";
import { attachResolvedCadSecrets, asCreateCadJobInput } from "../services/cad-secret-resolve";

const sanitizePrompt = (prompt: string): string =>
  prompt.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();

const ownerIdFromAuth = (request: Request): string => {
  const auth = request.cadAuth;
  if (!auth) throw cadForbidden();
  return auth.accountId ?? auth.cavalId;
};

export const createJobHandlers = [
  cadRateLimitMiddleware,
  validateBody(createCadJobSchema),
  cadSafetyMiddleware,
  async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = request.cadAuth;
      if (!auth) throw cadForbidden();

      const raw = request.body as CreateCadJobInput;
      const secured = (await attachResolvedCadSecrets(
        request,
        raw as unknown as Record<string, unknown> & { providerProfileId?: string }
      )) as unknown as CreateCadJobInput;

      const ownerId = ownerIdFromAuth(request);
      const input: CreateCadJobInput = {
        ...asCreateCadJobInput(secured as unknown as Record<string, unknown>, ownerId),
        prompt: sanitizePrompt(secured.prompt ?? raw.prompt),
      };

      const jobId = await enqueueCadJob(input, ownerId);
      response.status(202).json({ ok: true, jobId, status: "queued" });
    } catch (error) {
      next(error);
    }
  },
];

export const getJobHandlers = [
  validateParams(jobIdParamSchema),
  async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = request.cadAuth;
      if (!auth) throw cadForbidden();

      const { id } = request.params as { id: string };
      const job = await getCadJob(id);
      if (!job) throw cadNotFound("Job not found");

      assertJobOwnership(job, ownerIdFromAuth(request));

      const result = await buildCadJobResult(job);
      response.json(toCadJobPublicView(result));
    } catch (error) {
      next(error);
    }
  },
];

export const deleteJobHandlers = [
  validateParams(jobIdParamSchema),
  async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = request.cadAuth;
      if (!auth) throw cadForbidden();

      const { id } = request.params as { id: string };
      const job = await getCadJob(id);
      if (!job) throw cadNotFound("Job not found");

      assertJobOwnership(job, ownerIdFromAuth(request));

      await cancelCadJobProcessing(id);
      cadLog({
        level: "info",
        event: "job_cancelled",
        jobId: id,
        cavalId: auth.cavalId,
        accountId: auth.accountId ?? undefined,
      });
      response.json({ ok: true, jobId: id, status: "cancelled" });
    } catch (error) {
      next(error);
    }
  },
];

export const getJobResultHandlers = [
  validateParams(jobIdParamSchema),
  async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = request.cadAuth;
      if (!auth) throw cadForbidden();

      const { id } = request.params as { id: string };
      const job = await getCadJob(id);
      if (!job) throw cadNotFound("Job not found");

      assertJobOwnership(job, ownerIdFromAuth(request));

      const result = await buildCadJobResult(job);
      const localBuffer = getLocalStlBuffer(id);

      const wantsJson =
        request.query.format === "json" ||
        (request.header("accept") ?? "").includes("application/json");
      if (localBuffer && !wantsJson) {
        response.setHeader("Content-Type", "model/stl");
        response.setHeader("Cache-Control", "private, max-age=60");
        response.send(localBuffer);
        return;
      }

      response.json({
        ok: true,
        jobId: id,
        status: result.status,
        stlSignedUrl: result.stlSignedUrl,
        scad: result.scad,
        dimensions: result.dimensions,
        meshTaskId: result.meshTaskId,
        error: result.error,
      });
    } catch (error) {
      next(error);
    }
  },
];

export const getJobLogsHandlers = [
  validateParams(jobIdParamSchema),
  async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = request.cadAuth;
      if (!auth) throw cadForbidden();

      const { id } = request.params as { id: string };
      const job = await getCadJob(id);
      if (!job) throw cadNotFound("Job not found");

      assertJobOwnership(job, ownerIdFromAuth(request));

      response.json({ ok: true, jobId: id, logs: getJobLogs(id) });
    } catch (error) {
      next(error);
    }
  },
];
