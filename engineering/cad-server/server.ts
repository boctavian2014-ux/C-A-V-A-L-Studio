import express from "express";
import { cadCorsMiddleware } from "./middleware/cors";
import { requireCadAuth, optionalCadAuth } from "./middleware/auth";
import { cadErrorHandler } from "./middleware/error-handler";
import { healthRouter } from "./routes/health";
import { planRouterHandlers } from "./routes/plan";
import {
  createJobHandlers,
  deleteJobHandlers,
  getJobHandlers,
  getJobLogsHandlers,
  getJobResultHandlers,
} from "./routes/jobs";
import { startCadJobCleanup } from "./services/job-cleanup";

export { cadHealthCheck } from "./routes/health";

export const createCadServer = (): express.Application => {
  const app = express();
  app.disable("x-powered-by");
  app.use(cadCorsMiddleware());
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", optionalCadAuth, (req, res, next) => {
    void healthRouter(req, res).catch(next);
  });

  app.use(requireCadAuth);

  app.post("/cad/plan", ...planRouterHandlers);
  app.post("/cad/jobs", ...createJobHandlers);
  app.get("/cad/jobs/:id", ...getJobHandlers);
  app.delete("/cad/jobs/:id", ...deleteJobHandlers);
  app.get("/cad/jobs/:id/result", ...getJobResultHandlers);
  app.get("/cad/jobs/:id/logs", ...getJobLogsHandlers);

  app.use(cadErrorHandler);

  startCadJobCleanup();
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
