import { randomUUID } from "node:crypto";
import type { CadConstraints, CadJobRecord, CadJobStatus } from "./types";

const jobs = new Map<string, CadJobRecord>();

export const resetCadJobsForTests = (): void => {
  jobs.clear();
};

export const createMemoryCadJob = (input: {
  prompt: string;
  projectType?: string;
  constraints?: CadConstraints;
  cavalId?: string;
}): CadJobRecord => {
  const id = randomUUID();
  const now = new Date().toISOString();
  const record: CadJobRecord = {
    id,
    cavalId: input.cavalId ?? null,
    prompt: input.prompt,
    projectType: input.projectType ?? null,
    constraints: input.constraints ?? {},
    generatedScad: null,
    status: "queued",
    errorMessage: null,
    stlPath: null,
    stlUrl: null,
    createdAt: now,
    updatedAt: now,
  };
  jobs.set(id, record);
  return record;
};

export const getMemoryCadJob = (id: string): CadJobRecord | null => jobs.get(id) ?? null;

export const updateMemoryCadJob = (
  id: string,
  patch: Partial<Omit<CadJobRecord, "id" | "createdAt">>
): CadJobRecord | null => {
  const existing = jobs.get(id);
  if (!existing) return null;
  const updated: CadJobRecord = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  jobs.set(id, updated);
  return updated;
};

export const listMemoryCadJobs = (): CadJobRecord[] =>
  [...jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export const memoryCadJobStatus = (id: string): CadJobStatus | null => jobs.get(id)?.status ?? null;
