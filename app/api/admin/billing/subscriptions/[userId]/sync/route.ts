import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { guardAdminMutation } from "@/lib/admin/mutation";
import { writeAudit } from "@/lib/admin/audit";
import { getStripe } from "@/lib/billing/stripe";
import { syncSubscriptionForUser } from "@/lib/billing/sync";

export const runtime = "nodejs";

// POST /api/admin/billing/subscriptions/[userId]/sync — re-pull the user's live
// subscription from Stripe and re-write the row via the shared sync logic (the
// same code the webhook uses). Useful when a webhook was missed/failed.
export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin, user, ip, userAgent } = gate.ctx;
  const { userId } = await params;

  const over = await guardAdminMutation(gate.ctx);
  if (over) return over;

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe isn't configured." }, { status: 503 });
  }

  let result: Awaited<ReturnType<typeof syncSubscriptionForUser>>;
  try {
    result = await syncSubscriptionForUser(admin, stripe, userId);
  } catch (err) {
    return NextResponse.json(
      { error: `Stripe sync failed: ${err instanceof Error ? err.message : "unknown error"}` },
      { status: 502 }
    );
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.reason ?? "Sync failed." }, { status: 404 });
  }

  await writeAudit(admin, {
    adminId: user.id,
    action: "billing.sync",
    targetType: "subscription",
    targetId: userId,
    payload: { tier: result.tier, status: result.status },
    ip,
    userAgent,
  });

  return NextResponse.json({ ok: true, tier: result.tier, status: result.status });
}
