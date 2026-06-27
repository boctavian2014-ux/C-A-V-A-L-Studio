import type { CadJob, CadJobPublicView, CadJobResult } from "../types";
import { getLocalMeshTaskId, getLocalStlDimensions } from "../storage/local-artifacts";
import {
  createPrivateStlSignedUrl,
  resolveLocalResultUrl,
} from "../storage/signed-url";

export const resolveCadPublicBaseUrl = (): string => {
  if (process.env.CAD_PUBLIC_URL) return process.env.CAD_PUBLIC_URL.replace(/\/+$/, "");
  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railwayDomain) return `https://${railwayDomain}`;
  const port = process.env.PORT ?? process.env.CAD_PORT ?? 8791;
  return `http://127.0.0.1:${port}`;
};

export const buildCadJobResult = async (job: CadJob): Promise<CadJobResult> => {
  let stlSignedUrl: string | null = null;
  if (job.status === "done" && job.stlPath) {
    stlSignedUrl = await createPrivateStlSignedUrl(job.stlPath);
    if (!stlSignedUrl) {
      stlSignedUrl = resolveLocalResultUrl(job.id, resolveCadPublicBaseUrl());
    }
  }

  const dimensions = getLocalStlDimensions(job.id) ?? null;
  const meshTaskId = job.meshTaskId ?? getLocalMeshTaskId(job.id) ?? null;

  return {
    ok: true,
    jobId: job.id,
    status: job.status,
    stlSignedUrl,
    scad: job.generatedScad,
    dimensions,
    meshTaskId,
    error: job.errorMessage,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
};

export const toCadJobPublicView = (result: CadJobResult): CadJobPublicView => ({
  ok: true,
  jobId: result.jobId,
  status: result.status,
  stlUrl: result.stlSignedUrl,
  scad: result.scad,
  error: result.error,
  dimensions: result.dimensions,
  meshTaskId: result.meshTaskId,
  createdAt: result.createdAt,
  updatedAt: result.updatedAt,
});
