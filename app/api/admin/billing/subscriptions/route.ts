import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { parseListQuery, listResponse } from "@/lib/admin/query";
import { resolveEmails } from "@/lib/admin/users";

export const runtime = "nodejs";

const SORTS = ["updated_at", "current_period_end", "tier", "status"] as const;

export type AdminSubscriptionRow = {
  userId: string;
  username: string | null;
  email: string | null;
  tier: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

// True when Stripe is running against a test-mode key — the UI prefixes deep
// links with /test so they resolve in the Stripe test dashboard.
function stripeTestMode(): boolean {
  return process.env.STRIPE_SECRET_KEY?.trim().startsWith("sk_test_") ?? false;
}

// GET /api/admin/billing/subscriptions — subscription directory. Filters: tier,
// status (query params). Search (q): exact Stripe customer id.
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin } = gate.ctx;

  const url = new URL(request.url);
  const query = parseListQuery(url, SORTS, "updated_at");
  const tierFilter = url.searchParams.get("tier") ?? undefined;
  const statusFilter = url.searchParams.get("status") ?? undefined;

  let builder = admin
    .from("subscriptions")
    .select(
      "user_id, tier, status, current_period_end, cancel_at_period_end, stripe_customer_id, stripe_subscription_id",
      { count: "exact" }
    );

  if (tierFilter) builder = builder.eq("tier", tierFilter);
  if (statusFilter) builder = builder.eq("status", statusFilter);
  if (query.q) builder = builder.eq("stripe_customer_id", query.q);

  builder = builder.order(query.sort, { ascending: query.dir === "asc" }).range(query.from, query.to);

  const { data, count, error } = await builder;
  if (error) {
    return NextResponse.json({ error: "Failed to load subscriptions." }, { status: 500 });
  }

  const rows = (data ?? []) as {
    user_id: string;
    tier: string;
    status: string;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
  }[];
  const ids = rows.map((r) => r.user_id);

  const [emails, profilesResult] = await Promise.all([
    resolveEmails(admin, ids),
    ids.length
      ? admin.from("profiles").select("id, username").in("id", ids)
      : Promise.resolve({ data: [] as { id: string; username: string | null }[] }),
  ]);
  const usernameById = new Map(
    ((profilesResult.data ?? []) as { id: string; username: string | null }[]).map((p) => [
      p.id,
      p.username,
    ])
  );

  const result: AdminSubscriptionRow[] = rows.map((r) => ({
    userId: r.user_id,
    username: usernameById.get(r.user_id) ?? null,
    email: emails.get(r.user_id) ?? null,
    tier: r.tier,
    status: r.status,
    currentPeriodEnd: r.current_period_end,
    cancelAtPeriodEnd: Boolean(r.cancel_at_period_end),
    stripeCustomerId: r.stripe_customer_id,
    stripeSubscriptionId: r.stripe_subscription_id,
  }));

  return NextResponse.json({ ...listResponse(result, count, query), testMode: stripeTestMode() });
}
