import { createClient, type SupabaseClient, type SupabaseClientOptions } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

const supabaseClientOptions = (): SupabaseClientOptions<"public"> => {
  const options: SupabaseClientOptions<"public"> = {
    auth: { persistSession: false, autoRefreshToken: false },
  };
  try {
    // Node < 22 needs ws for @supabase/realtime-js (Railway CAD server)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ws = require("ws") as NonNullable<SupabaseClientOptions<"public">["realtime"]>["transport"];
    options.realtime = { transport: ws };
  } catch {
    // ws optional when not installed (local dev on Node 22+)
  }
  return options;
};
export const isSupabaseConfigured = (): boolean =>
  Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

export const getSupabaseAdmin = (): SupabaseClient | null => {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    client = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      supabaseClientOptions()
    );
  }
  return client;
};
