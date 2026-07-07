// Founder/admin bypass (agent-provisioned, no UI to self-grant): `profiles.is_admin`
// is read-only to the authenticated role (see migration profile_is_admin) — only
// service-role/SQL can set it. Callers that enforce a plan cap should check this
// first and skip the cap entirely for admins. Fails closed (false) on any error
// so a DB blip never accidentally grants elevated access.
import type { SupabaseClient } from "@supabase/supabase-js";

export async function isAdminUser(supabase: SupabaseClient, userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", userId)
      .maybeSingle();
    if (error || !data) return false;
    return data.is_admin === true;
  } catch {
    return false;
  }
}
