import { getSupabaseAdmin, isSupabaseConfigured } from "../../../billing/supabase/client";
import { cadForbidden } from "../middleware/errors";
import type {
  CadConstraints,
  CadGenerationMode,
  CadJob,
  CadJobStatus,
  CreateCadJobInput,
} from "../types";
import {
  createMemoryCadJob,
  deleteExpiredMemoryCadJobs,
  getMemoryCadJob,
  updateMemoryCadJob,
} from "./memory-store";

type DbRow = {
  id: string;
  user_id: string | null;
  caval_id: string | null;
  prompt: string;
  project_type: string | null;
  constraints: CadConstraints | null;
  generation_mode: CadGenerationMode | null;
  generated_scad: string | null;
  status: CadJobStatus;
  error_message: string | null;
  stl_path: string | null;
  mesh_task_id: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
};

const JOB_TTL_MS = Number(process.env.CAD_JOB_TTL_MS ?? 86_400_000);

const rowToJob = (row: DbRow): CadJob => ({
  id: row.id,
  userId: row.user_id,
  cavalId: row.caval_id,
  prompt: row.prompt,
  projectType: row.project_type,
  constraints: row.constraints ?? {},
  generationMode: row.generation_mode ?? "openscad",
  generatedScad: row.generated_scad,
  status: row.status,
  errorMessage: row.error_message,
  stlPath: row.stl_path,
  meshTaskId: row.mesh_task_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  expiresAt: row.expires_at,
});

export const isCadPersistenceConfigured = (): boolean => isSupabaseConfigured();

export const createCadJob = async (
  input: CreateCadJobInput,
  ownerCavalId: string
): Promise<CadJob> => {
  const cavalId = input.cavalId ?? ownerCavalId;
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return createMemoryCadJob({
      prompt: input.prompt,
      projectType: input.projectType,
      constraints: input.constraints,
      cavalId,
      generationMode: input.generationMode,
    });
  }

  const expiresAt = new Date(Date.now() + JOB_TTL_MS).toISOString();
  const { data, error } = await supabase
    .from("cad_generations")
    .insert({
      prompt: input.prompt,
      project_type: input.projectType ?? null,
      constraints: input.constraints ?? {},
      caval_id: cavalId,
      status: "queued",
      generation_mode: input.generationMode ?? "openscad",
      expires_at: expiresAt,
    })
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to create CAD job");
  return rowToJob(data as DbRow);
};

export const getCadJob = async (id: string): Promise<CadJob | null> => {
  const supabase = getSupabaseAdmin();
  if (!supabase) return getMemoryCadJob(id);

  const { data, error } = await supabase
    .from("cad_generations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToJob(data as DbRow) : null;
};

export const updateCadJob = async (
  id: string,
  patch: Partial<{
    status: CadJobStatus;
    generatedScad: string | null;
    errorMessage: string | null;
    stlPath: string | null;
    meshTaskId: string | null;
  }>
): Promise<CadJob | null> => {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return updateMemoryCadJob(id, patch);
  }

  const dbPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status !== undefined) dbPatch.status = patch.status;
  if (patch.generatedScad !== undefined) dbPatch.generated_scad = patch.generatedScad;
  if (patch.errorMessage !== undefined) dbPatch.error_message = patch.errorMessage;
  if (patch.stlPath !== undefined) dbPatch.stl_path = patch.stlPath;
  if (patch.meshTaskId !== undefined) dbPatch.mesh_task_id = patch.meshTaskId;

  const { data, error } = await supabase
    .from("cad_generations")
    .update(dbPatch)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? rowToJob(data as DbRow) : null;
};

export const assertJobOwnership = (
  job: CadJob,
  requestCavalId: string
): void => {
  if (requestCavalId === "anonymous") return;
  if (job.cavalId && job.cavalId !== requestCavalId) {
    throw cadForbidden("You do not own this job");
  }
};

export const cleanupExpiredCadJobs = async (): Promise<number> => {
  const supabase = getSupabaseAdmin();
  if (!supabase) return deleteExpiredMemoryCadJobs();

  const cutoff = new Date(Date.now() - JOB_TTL_MS).toISOString();
  const { data, error } = await supabase
    .from("cad_generations")
    .delete()
    .lt("created_at", cutoff)
    .select("id");

  if (error) {
    console.warn("[cad] cleanup failed", error.message);
    return 0;
  }
  return data?.length ?? 0;
};

// Re-export memory helpers for tests
export { resetCadJobsForTests } from "./memory-store";
export {
  uploadPrivateCadStl,
  createPrivateStlSignedUrl,
  deletePrivateCadStl,
  resolveLocalResultUrl,
} from "./signed-url";
