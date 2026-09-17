import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Server-only client with the service role key (bypasses RLS). Never import
// from a client component. Created lazily so `next build` needs no env vars.
export function supabaseAdmin(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
