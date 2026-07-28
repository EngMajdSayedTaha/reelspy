import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NEUTRAL_SYNC_STATUS, readSyncStatus } from "@/lib/instagram/sync-status";

// Powers the top-bar sync chip: is this user's data current, is anything
// refreshing, is Instagram pausing us. Replaces /api/ig/rate-limit, which
// reported a per-user Meta budget the main sync path never spends.
export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    return NextResponse.json(await readSyncStatus(supabase, admin, user.id));
  } catch (error) {
    // Limiter not provisioned / service key missing. Report the neutral state
    // rather than an error: the chip stays rendered and simply says nothing is
    // wrong, which is true — syncing itself fails open (see acquire()). The old
    // widget removed itself from the page in this case, so the control came and
    // went between sessions and stopped being something users trusted.
    console.warn(
      "[sync-status] falling back to neutral status:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(NEUTRAL_SYNC_STATUS);
  }
}
