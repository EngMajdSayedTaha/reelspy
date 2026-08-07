import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// POST /api/auth/clear-forced-reset — self-service: a signed-in user clears
// their OWN profiles.force_password_reset flag after successfully changing
// their password (see components/auth/ResetPasswordForm.tsx `forced` mode).
// That column is otherwise read-only to the authenticated role (see migration
// force_password_reset), so this route — scoped to the caller's own id via
// the service-role client — is the only path that can clear it.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ force_password_reset: false, force_password_reset_at: null, force_password_reset_reason: null })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: "Failed to clear reset flag." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
