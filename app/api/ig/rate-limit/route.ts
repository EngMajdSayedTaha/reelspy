import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { readRateLimitStatus } from "@/lib/instagram/rate-limit";

// Lightweight status for the UI: how much of the Instagram request budget this
// user (and the shared app pool) has left, and whether we're in a cooldown.
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
    const status = await readRateLimitStatus(admin, user.id);
    return NextResponse.json(status);
  } catch {
    // Limiter not provisioned / service key missing — report a neutral status
    // rather than breaking the page.
    return NextResponse.json({
      throttled: false,
      retryAfterSeconds: 0,
      appUsagePct: 0,
      userUsed: 0,
      userCap: 0,
      userResetSeconds: 0,
    });
  }
}
