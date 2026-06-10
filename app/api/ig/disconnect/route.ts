import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clearIgToken } from "@/lib/instagram/token-store";

// Clears the stored Instagram token so the user can reconnect cleanly.
// POST only: a state-changing GET would be triggerable by any cross-site link
// (SameSite=Lax cookies ride along on top-level GET navigations).
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await clearIgToken(createAdminClient(), user.id);
  } catch (error) {
    console.error("Instagram disconnect failed", error);
    return NextResponse.json({ error: "Could not disconnect. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
