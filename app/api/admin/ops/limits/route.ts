import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";

export const runtime = "nodejs";

// GET /api/admin/ops/limits — live rate-limiter state: the Meta API token bucket
// (singleton), the busiest Meta API per-user windows, and the hottest per-action
// throttle windows.
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin } = gate.ctx;

  const [metaLimiter, metaUsers, actionUsage] = await Promise.all([
    admin.from("meta_api_limiter").select("*").eq("id", 1).maybeSingle(),
    admin
      .from("meta_api_user_usage")
      .select("user_id, window_start, call_count")
      .order("call_count", { ascending: false })
      .limit(20),
    admin
      .from("user_action_usage")
      .select("user_id, action, window_start, call_count")
      .order("call_count", { ascending: false })
      .limit(20),
  ]);

  return NextResponse.json({
    metaLimiter: metaLimiter.data ?? null,
    metaTopUsers: metaUsers.data ?? [],
    hotActions: actionUsage.data ?? [],
  });
}
