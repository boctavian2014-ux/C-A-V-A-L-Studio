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

const sanitizePrompt = (prompt: string): string =>
  prompt.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();

export const createJobHandlers = [
  cadRateLimitMiddleware,
  validateBody(createCadJobSchema),
  cadSafetyMiddleware,
  async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = request.cadAuth;
      if (!auth) throw cadForbidden();

      const body = request.body as CreateCadJobInput;
      const input: CreateCadJobInput = {
        ...body,
        prompt: sanitizePrompt(body.prompt),
        cavalId: body.cavalId ?? auth.cavalId,
      };

      const jobId = await enqueueCadJob(input, auth.cavalId);
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

      assertJobOwnership(job, auth.cavalId);

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

      assertJobOwnership(job, auth.cavalId);

      await cancelCadJobProcessing(id);
      cadLog({ level: "info", event: "job_cancelled", jobId: id, cavalId: auth.cavalId });
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

      assertJobOwnership(job, auth.cavalId);

      const result = await buildCadJobResult(job);
      const localBuffer = getLocalStlBuffer(id);

      if (localBuffer && request.header("accept")?.includes("model/stl")) {
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

      assertJobOwnership(job, auth.cavalId);

      response.json({ ok: true, jobId: id, logs: getJobLogs(id) });
    } catch (error) {
      next(error);
    }
  },
];
