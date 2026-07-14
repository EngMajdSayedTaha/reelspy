import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin/auth";
import { PLANS, type PaidTier } from "@/lib/billing/plans";

export const runtime = "nodejs";

// Overview metrics for the admin dashboard. All reads go through the service-role
// client behind the admin gate. Aggregations that Postgres would normally do with
// GROUP BY are done in-memory here (supabase-js has no group-by) — fine at the
// current scale for an infrequently-hit founder tool.

const ACTIVE_SUB_STATUSES = ["active", "trialing", "past_due"];

// Monthly price (indicative AED) per paid tier, from the plans catalog.
function priceForTier(tier: string): number {
  const plan = PLANS.find((p) => p.tier === tier);
  return plan?.priceAed ?? 0;
}

async function countSince(
  admin: SupabaseClient,
  table: string,
  column: string,
  sinceIso: string
): Promise<number> {
  const { count } = await admin
    .from(table)
    .select("*", { count: "exact", head: true })
    .gte(column, sinceIso);
  return count ?? 0;
}

export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin } = gate.ctx;

  const now = Date.now();
  const iso = (ms: number) => new Date(now - ms).toISOString();
  const DAY = 86_400_000;
  const since7 = iso(7 * DAY);
  const since30 = iso(30 * DAY);
  const since24h = iso(DAY);

  // ── Users ────────────────────────────────────────────────────────────────
  const totalUsersP = admin
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .then((r) => r.count ?? 0);
  const signups7P = countSince(admin, "profiles", "created_at", since7);
  const signups30P = countSince(admin, "profiles", "created_at", since30);

  // ── Subscriptions (active, by tier) ──────────────────────────────────────
  const subsP = admin
    .from("subscriptions")
    .select("tier, status")
    .in("status", ACTIVE_SUB_STATUSES);

  // ── Jobs health ──────────────────────────────────────────────────────────
  const jobsP = admin.from("jobs").select("status");
  const failed24hP = admin
    .from("jobs")
    .select("*", { count: "exact", head: true })
    .eq("status", "failed")
    .gte("updated_at", since24h);
  const oldestQueuedP = admin
    .from("jobs")
    .select("run_at")
    .eq("status", "queued")
    .order("run_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  // ── AI usage 30d ─────────────────────────────────────────────────────────
  const aiP = admin
    .from("ai_usage")
    .select("model, input_tokens, output_tokens")
    .gte("created_at", since30)
    .limit(100_000);

  // ── Weekly loop completers (latest week) ─────────────────────────────────
  const wlcP = admin
    .from("wlc_weekly")
    .select("week, loop_completers")
    .order("week", { ascending: false })
    .limit(1)
    .maybeSingle();

  const [totalUsers, signups7, signups30, subs, jobsRows, failed24h, oldestQueued, aiRows, wlc] =
    await Promise.all([
      totalUsersP,
      signups7P,
      signups30P,
      subsP,
      jobsP,
      failed24hP,
      oldestQueuedP,
      aiP,
      wlcP,
    ]);

  // Aggregate subscriptions by tier + estimate MRR.
  const subsByTier: Record<string, number> = {};
  let mrrAed = 0;
  for (const row of (subs.data ?? []) as { tier: string }[]) {
    subsByTier[row.tier] = (subsByTier[row.tier] ?? 0) + 1;
    mrrAed += priceForTier(row.tier);
  }
  const activePaidCount = Object.entries(subsByTier)
    .filter(([tier]) => tier !== "free")
    .reduce((sum, [, n]) => sum + n, 0);

  // Aggregate jobs by status.
  const jobsByStatus: Record<string, number> = { queued: 0, running: 0, done: 0, failed: 0 };
  for (const row of (jobsRows.data ?? []) as { status: string }[]) {
    jobsByStatus[row.status] = (jobsByStatus[row.status] ?? 0) + 1;
  }
  const oldestQueuedAgeSeconds = oldestQueued.data?.run_at
    ? Math.max(0, Math.floor((now - new Date(oldestQueued.data.run_at).getTime()) / 1000))
    : null;

  // Estimate AI spend (USD) using per-model token pricing (matches the
  // ai_cost_per_user view's rate card, extended with Opus).
  let aiEstUsd = 0;
  let aiCalls = 0;
  for (const row of (aiRows.data ?? []) as {
    model: string;
    input_tokens: number | null;
    output_tokens: number | null;
  }[]) {
    aiCalls += 1;
    const inTok = row.input_tokens ?? 0;
    const outTok = row.output_tokens ?? 0;
    const model = row.model ?? "";
    if (model.includes("haiku")) aiEstUsd += (inTok / 1e6) * 1.0 + (outTok / 1e6) * 5.0;
    else if (model.includes("sonnet")) aiEstUsd += (inTok / 1e6) * 3.0 + (outTok / 1e6) * 15.0;
    else if (model.includes("opus")) aiEstUsd += (inTok / 1e6) * 15.0 + (outTok / 1e6) * 75.0;
  }

  return NextResponse.json({
    users: { total: totalUsers, signups7d: signups7, signups30d: signups30 },
    subscriptions: {
      byTier: subsByTier as Partial<Record<PaidTier | "free" | "custom", number>>,
      activePaid: activePaidCount,
      mrrAed,
    },
    jobs: {
      byStatus: jobsByStatus,
      failed24h: failed24h.count ?? 0,
      oldestQueuedAgeSeconds,
    },
    ai: { calls30d: aiCalls, estUsd30d: Math.round(aiEstUsd * 100) / 100 },
    weeklyLoopCompleters: wlc.data?.loop_completers ?? 0,
    generatedAt: new Date(now).toISOString(),
  });
}
