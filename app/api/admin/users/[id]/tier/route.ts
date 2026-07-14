import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { guardAdminMutation, parseBody } from "@/lib/admin/mutation";
import { writeAudit } from "@/lib/admin/audit";
import { coerceEntitlements } from "@/lib/billing/entitlements";

export const runtime = "nodejs";

const entitlementsSchema = z.object({
  accounts: z.number().int(),
  scripts_mo: z.number().int(),
  transcripts_mo: z.number().int(),
  automations: z.number().int(),
  publish_targets: z.number().int(),
  ig_connections: z.number().int(),
  model: z.enum(["haiku", "sonnet", "opus"]),
});

const schema = z.object({
  tier: z.enum(["free", "creator", "pro", "studio", "custom"]),
  custom_entitlements: entitlementsSchema.optional(),
});

// POST /api/admin/users/[id]/tier — comp/override a user's subscription tier.
// Writes an ACTIVE subscription row with NULL Stripe ids, marking it a manual
// grant (not tied to a live Stripe subscription — mirrors the custom-plan
// handling in lib/billing/resolve.ts). For tier=custom, custom_entitlements is
// required and validated against the Entitlements shape.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin, user, ip, userAgent } = gate.ctx;
  const { id } = await params;

  const over = await guardAdminMutation(gate.ctx);
  if (over) return over;

  const body = await parseBody(request, schema);
  if (!body.ok) return body.response;

  if (body.data.tier === "custom") {
    const ent = body.data.custom_entitlements
      ? coerceEntitlements(body.data.custom_entitlements)
      : null;
    if (!ent) {
      return NextResponse.json(
        { error: "tier=custom requires a valid custom_entitlements object." },
        { status: 400 }
      );
    }
  }

  const { data: before } = await admin
    .from("subscriptions")
    .select("tier, status, stripe_customer_id, stripe_subscription_id, custom_entitlements")
    .eq("user_id", id)
    .maybeSingle();

  const row = {
    user_id: id,
    tier: body.data.tier,
    status: "active",
    // Manual grant: not attached to a live Stripe subscription.
    stripe_customer_id: null as string | null,
    stripe_subscription_id: null as string | null,
    custom_entitlements: body.data.tier === "custom" ? body.data.custom_entitlements : null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await admin.from("subscriptions").upsert(row, { onConflict: "user_id" });
  if (error) {
    return NextResponse.json({ error: "Failed to update tier." }, { status: 500 });
  }

  await writeAudit(admin, {
    adminId: user.id,
    action: "user.tier",
    targetType: "user",
    targetId: id,
    payload: { before: before ?? null, after: { tier: row.tier, status: row.status, custom_entitlements: row.custom_entitlements } },
    ip,
    userAgent,
  });

  return NextResponse.json({ ok: true, tier: row.tier });
}
