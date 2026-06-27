import { getSupabaseAdmin } from "../../../billing/supabase/client";
import { cadLog } from "../middleware/logger";

const BUCKET = "cad-models";
const DEFAULT_TTL_SEC = Number(process.env.CAD_SIGNED_URL_TTL_SEC ?? 3600);

export const createPrivateStlSignedUrl = async (storagePath: string): Promise<string | null> => {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, DEFAULT_TTL_SEC);

  if (error || !data?.signedUrl) {
    cadLog({
      level: "error",
      event: "signed_url_failed",
      message: error?.message ?? "No signed URL returned",
      meta: { storagePath },
    });
    return null;
  }

  return data.signedUrl;
};

export const uploadPrivateCadStl = async (input: {
  jobId: string;
  cavalId: string | null;
  buffer: Buffer;
}): Promise<{ path: string }> => {
  const supabase = getSupabaseAdmin();
  const folder = input.cavalId ?? "anonymous";
  const path = `${folder}/${input.jobId}.stl`;

  if (!supabase) {
    return { path };
  }

  const { error } = await supabase.storage.from(BUCKET).upload(path, input.buffer, {
    contentType: "model/stl",
    upsert: true,
  });

  if (error) throw new Error(error.message);
  return { path };
};

export const deletePrivateCadStl = async (storagePath: string | null): Promise<void> => {
  if (!storagePath) return;
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  await supabase.storage.from(BUCKET).remove([storagePath]);
};

export const resolveLocalResultUrl = (jobId: string, baseUrl: string): string =>
  `${baseUrl.replace(/\/+$/, "")}/cad/jobs/${encodeURIComponent(jobId)}/result`;
