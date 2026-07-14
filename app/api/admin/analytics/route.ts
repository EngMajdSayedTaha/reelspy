import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";

export const runtime = "nodejs";

// GET /api/admin/analytics — service-role reads of the derived analytics views
// (activation funnel, retention cohorts, weekly publish success, top AI cost,
// weekly loop completers). Read-only.
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin } = gate.ctx;

  const [funnelR, cohortsR, publishR, aiR, wlcR] = await Promise.all([
    admin.from("activation_funnel").select("*").limit(100_000),
    admin.from("retention_cohorts").select("*").limit(2_000),
    admin.from("publish_success_weekly").select("*").order("week", { ascending: false }).limit(52),
    admin.from("ai_cost_per_user").select("*").limit(20),
    admin.from("wlc_weekly").select("*").order("week", { ascending: false }).limit(26),
  ]);

  // Collapse the per-user activation funnel into stage counts + SLA rate.
  const funnelRows = (funnelR.data ?? []) as {
    signed_up_at: string | null;
    ig_connected_at: string | null;
    account_added_at: string | null;
    feed_synced_at: string | null;
    first_script_at: string | null;
    met_sla: boolean | null;
  }[];
  const funnel = {
    signed_up: funnelRows.filter((r) => r.signed_up_at).length,
    ig_connected: funnelRows.filter((r) => r.ig_connected_at).length,
    account_added: funnelRows.filter((r) => r.account_added_at).length,
    feed_synced: funnelRows.filter((r) => r.feed_synced_at).length,
    first_script: funnelRows.filter((r) => r.first_script_at).length,
    met_sla: funnelRows.filter((r) => r.met_sla === true).length,
    total: funnelRows.length,
  };

  return NextResponse.json({
    funnel,
    retentionCohorts: cohortsR.data ?? [],
    publishSuccessWeekly: publishR.data ?? [],
    aiCostTop: aiR.data ?? [],
    weeklyLoopCompleters: (wlcR.data ?? []).slice().reverse(),
  });
}
