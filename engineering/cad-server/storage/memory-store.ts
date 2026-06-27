import { randomUUID } from "node:crypto";
import type {
  CadConstraints,
  CadGenerationMode,
  CadJob,
  CadJobStatus,
  CreateCadJobInput,
} from "../types";

const jobs = new Map<string, CadJob>();

const JOB_TTL_MS = Number(process.env.CAD_JOB_TTL_MS ?? 86_400_000);

const nowIso = (): string => new Date().toISOString();

export const resetCadJobsForTests = (): void => {
  jobs.clear();
};

export const createMemoryCadJob = (input: {
  prompt: string;
  projectType?: string;
  constraints?: CadConstraints;
  cavalId?: string;
  userId?: string | null;
  generationMode?: CadGenerationMode;
}): CadJob => {
  const id = randomUUID();
  const now = nowIso();
  const record: CadJob = {
    id,
    userId: input.userId ?? null,
    cavalId: input.cavalId ?? null,
    prompt: input.prompt,
    projectType: input.projectType ?? null,
    constraints: input.constraints ?? {},
    generationMode: input.generationMode ?? "openscad",
    generatedScad: null,
    status: "queued",
    errorMessage: null,
    stlPath: null,
    meshTaskId: null,
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(Date.now() + JOB_TTL_MS).toISOString(),
  };
  jobs.set(id, record);
  return record;
};

export const getMemoryCadJob = (id: string): CadJob | null => jobs.get(id) ?? null;

export const updateMemoryCadJob = (
  id: string,
  patch: Partial<Omit<CadJob, "id" | "createdAt">>
): CadJob | null => {
  const existing = jobs.get(id);
  if (!existing) return null;
  const updated: CadJob = {
    ...existing,
    ...patch,
    updatedAt: nowIso(),
  };
  jobs.set(id, updated);
  return updated;
};

export const listMemoryCadJobs = (): CadJob[] =>
  [...jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export const deleteExpiredMemoryCadJobs = (): number => {
  const cutoff = Date.now();
  let removed = 0;
  for (const [id, job] of jobs) {
    if (job.expiresAt && Date.parse(job.expiresAt) < cutoff) {
      jobs.delete(id);
      removed += 1;
    }
  }
  return removed;
};

export const memoryCadJobStatus = (id: string): CadJobStatus | null =>
  jobs.get(id)?.status ?? null;

/** @deprecated Use createMemoryCadJob input shape from CreateCadJobInput. */
export const createMemoryCadJobFromInput = (
  input: CreateCadJobInput,
  ownerCavalId: string
): CadJob =>
  createMemoryCadJob({
    prompt: input.prompt,
    projectType: input.projectType,
    constraints: input.constraints,
    cavalId: input.cavalId ?? ownerCavalId,
    generationMode: input.generationMode,
  });
