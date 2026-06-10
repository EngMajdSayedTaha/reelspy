import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role client for server-only, cross-user work: the cron jobs and the
// global snapshot cache, which read/write rows that don't belong to the calling
// user. It BYPASSES Row Level Security, so it must never be exposed to the
// browser, and callers are responsible for their own authorization checks.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
