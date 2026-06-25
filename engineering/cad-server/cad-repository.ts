import { getSupabaseAdmin, isSupabaseConfigured } from "../../billing/supabase/client";
import type { CadConstraints, CadJobRecord, CadJobStatus } from "./types";
import {
  createMemoryCadJob,
  getMemoryCadJob,
  updateMemoryCadJob,
} from "./memory-store";

type DbRow = {
  id: string;
  caval_id: string | null;
  prompt: string;
  project_type: string | null;
  constraints: CadConstraints | null;
  generated_scad: string | null;
  status: CadJobStatus;
  error_message: string | null;
  stl_path: string | null;
  stl_url: string | null;
  created_at: string;
  updated_at: string;
};

const rowToRecord = (row: DbRow): CadJobRecord => ({
  id: row.id,
  cavalId: row.caval_id,
  prompt: row.prompt,
  projectType: row.project_type,
  constraints: row.constraints ?? {},
  generatedScad: row.generated_scad,
  status: row.status,
  errorMessage: row.error_message,
  stlPath: row.stl_path,
  stlUrl: row.stl_url,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const createCadJob = async (input: {
  prompt: string;
  projectType?: string;
  constraints?: CadConstraints;
  cavalId?: string;
}): Promise<CadJobRecord> => {
  const supabase = getSupabaseAdmin();
  if (!supabase) return createMemoryCadJob(input);

  const { data, error } = await supabase
    .from("cad_generations")
    .insert({
      prompt: input.prompt,
      project_type: input.projectType ?? null,
      constraints: input.constraints ?? {},
      caval_id: input.cavalId ?? null,
      status: "queued",
    })
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to create CAD job");
  return rowToRecord(data as DbRow);
};

export const getCadJob = async (id: string): Promise<CadJobRecord | null> => {
  const supabase = getSupabaseAdmin();
  if (!supabase) return getMemoryCadJob(id);

  const { data, error } = await supabase.from("cad_generations").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToRecord(data as DbRow) : null;
};

export const updateCadJob = async (
  id: string,
  patch: Partial<{
    status: CadJobStatus;
    generatedScad: string | null;
    errorMessage: string | null;
    stlPath: string | null;
    stlUrl: string | null;
  }>
): Promise<CadJobRecord | null> => {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return updateMemoryCadJob(id, patch);
  }

  const dbPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status !== undefined) dbPatch.status = patch.status;
  if (patch.generatedScad !== undefined) dbPatch.generated_scad = patch.generatedScad;
  if (patch.errorMessage !== undefined) dbPatch.error_message = patch.errorMessage;
  if (patch.stlPath !== undefined) dbPatch.stl_path = patch.stlPath;
  if (patch.stlUrl !== undefined) dbPatch.stl_url = patch.stlUrl;

  const { data, error } = await supabase
    .from("cad_generations")
    .update(dbPatch)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? rowToRecord(data as DbRow) : null;
};

export const uploadCadStl = async (input: {
  jobId: string;
  cavalId: string | null;
  buffer: Buffer;
}): Promise<{ path: string; publicUrl: string }> => {
  const supabase = getSupabaseAdmin();
  const folder = input.cavalId ?? "anonymous";
  const path = `${folder}/${input.jobId}.stl`;

  if (!supabase) {
    const base =
      process.env.CAD_PUBLIC_URL ??
      (process.env.RAILWAY_PUBLIC_DOMAIN
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
        : `http://127.0.0.1:${process.env.PORT ?? process.env.CAD_PORT ?? 8791}`);
    return { path, publicUrl: `${base}/cad/files/${input.jobId}.stl` };
  }

  const { error } = await supabase.storage.from("cad-models").upload(path, input.buffer, {
    contentType: "model/stl",
    upsert: true,
  });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from("cad-models").getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
};

export const isCadPersistenceConfigured = (): boolean => isSupabaseConfigured();
