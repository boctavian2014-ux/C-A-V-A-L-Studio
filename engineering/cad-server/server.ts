import cors from "cors";
import express from "express";
import { getCadJob } from "./cad-repository";
import { enqueueCadJob, getLocalStlBuffer } from "./job-processor";
import { isCadPersistenceConfigured } from "./cad-repository";
import type { CadConstraints, CreateCadJobInput } from "./types";

export const cadHealthCheck = async () => ({
  ok: true,
  service: "cad",
  supabaseConfigured: isCadPersistenceConfigured(),
  openRouterConfigured: Boolean(process.env.OPENROUTER_API_KEY),
  llmModel: process.env.CAD_LLM_MODEL ?? "openai/gpt-4o-mini",
  allowFallback: process.env.CAD_ALLOW_FALLBACK === "1",
  checkedAt: new Date().toISOString(),
});

export const createCadServer = () => {
  const app = express();
  app.use(cors({ origin: process.env.CAD_CORS_ORIGIN ?? "*" }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", async (_request, response) => {
    response.json(await cadHealthCheck());
  });

  app.get("/cad/files/:jobId.stl", (request, response) => {
    const jobId = Array.isArray(request.params.jobId) ? request.params.jobId[0] : request.params.jobId;
    const buffer = getLocalStlBuffer(jobId);
    if (!buffer) {
      response.status(404).json({ ok: false, error: "STL not found" });
      return;
    }
    response.setHeader("Content-Type", "model/stl");
    response.send(buffer);
  });

  app.post("/cad/jobs", async (request, response) => {
    try {
      const body = request.body as CreateCadJobInput;
      if (!body?.prompt?.trim()) {
        response.status(400).json({ ok: false, error: "prompt is required" });
        return;
      }
      const jobId = await enqueueCadJob({
        prompt: body.prompt.trim(),
        projectType: body.projectType,
        constraints: (body.constraints ?? {}) as CadConstraints,
        cavalId: body.cavalId,
      });
      response.status(202).json({ ok: true, jobId, status: "queued" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      response.status(500).json({ ok: false, error: message });
    }
  });

  app.get("/cad/jobs/:id", async (request, response) => {
    try {
      const id = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
      const job = await getCadJob(id);
      if (!job) {
        response.status(404).json({ ok: false, error: "Job not found" });
        return;
      }
      response.json({
        ok: true,
        jobId: job.id,
        status: job.status,
        stlUrl: job.stlUrl,
        scad: job.generatedScad,
        error: job.errorMessage,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      response.status(500).json({ ok: false, error: message });
    }
  });

  return app;
};

export const resolveCadPort = (): number =>
  Number(process.env.PORT ?? process.env.CAD_PORT ?? 8791);

export const resolveCadPublicUrl = (): string | undefined => {
  if (process.env.CAD_PUBLIC_URL) return process.env.CAD_PUBLIC_URL;
  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railwayDomain) return `https://${railwayDomain}`;
  return undefined;
};

export const startCadServer = (port = resolveCadPort()): void => {
  const app = createCadServer();
  const host = "0.0.0.0";
  app.listen(port, host, () => {
    console.info(`[cad] listening on ${host}:${port}`);
    const publicUrl = resolveCadPublicUrl();
    if (publicUrl) console.info(`[cad] public URL: ${publicUrl}`);
  });
};
