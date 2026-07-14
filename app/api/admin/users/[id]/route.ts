import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { guardAdminMutation, parseBody } from "@/lib/admin/mutation";
import { writeAudit } from "@/lib/admin/audit";
import { toAdminAuthUser, contentCounts } from "@/lib/admin/users";
import { getStripe } from "@/lib/billing/stripe";

export const runtime = "nodejs";

// GET /api/admin/users/[id] — full support view for one user.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin } = gate.ctx;
  const { id } = await params;

  const [profileR, authR, subR, monthlyR, actionR, counts, eventsR, notesR, socialR, igR] =
    await Promise.all([
      admin.from("profiles").select("id, username, created_at, is_admin, color_theme, onboarded_at, digest_opt_out, ig_user_id, ig_token_status, fb_page_id, fb_page_name").eq("id", id).maybeSingle(),
      admin.auth.admin.getUserById(id),
      admin.from("subscriptions").select("tier, status, stripe_customer_id, stripe_subscription_id, current_period_end, cancel_at_period_end, custom_entitlements, updated_at").eq("user_id", id).maybeSingle(),
      admin.from("user_monthly_usage").select("action, period_month, call_count").eq("user_id", id).order("period_month", { ascending: false }),
      admin.from("user_action_usage").select("action, window_start, call_count").eq("user_id", id),
      contentCounts(admin, id),
      admin.from("app_events").select("id, event, props, created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(50),
      admin.from("admin_notes").select("id, note, admin_id, created_at").eq("user_id", id).order("created_at", { ascending: false }),
      admin.from("social_connections").select("id, platform, account_id, display_name, username, token_status, token_expires_at, created_at").eq("user_id", id),
      admin.from("ig_connections").select("id, ig_user_id, username, token_status, token_expires_at, created_at").eq("user_id", id),
    ]);

  if (!profileR.data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    profile: profileR.data,
    auth: toAdminAuthUser(authR.data?.user ?? null),
    subscription: subR.data ?? null,
    usage: {
      monthly: monthlyR.data ?? [],
      action: actionR.data ?? [],
    },
    contentCounts: counts,
    recentEvents: eventsR.data ?? [],
    notes: notesR.data ?? [],
    connections: {
      social: socialR.data ?? [],
      ig: igR.data ?? [],
    },
  });
}

const deleteSchema = z.object({
  confirm: z.string(),
  reason: z.string().max(500).optional(),
});

// DELETE /api/admin/users/[id] — GDPR erasure. Cancels any live Stripe
// subscription first (so we don't keep billing a deleted user), then removes the
// auth user, which cascades every user-owned row via the FKs. Guards against
// self-deletion. Requires a typed confirmation matching the user's email or
// username (echoed by the UI's type-to-confirm dialog).
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin, user, ip, userAgent } = gate.ctx;
  const { id } = await params;

  if (id === user.id) {
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  }

  const over = await guardAdminMutation(gate.ctx);
  if (over) return over;

  const body = await parseBody(request, deleteSchema);
  if (!body.ok) return body.response;

  // Verify the typed confirmation matches this user's email or username.
  const [authR, profileR, subR] = await Promise.all([
    admin.auth.admin.getUserById(id),
    admin.from("profiles").select("username").eq("id", id).maybeSingle(),
    admin.from("subscriptions").select("tier, status, stripe_subscription_id").eq("user_id", id).maybeSingle(),
  ]);
  const email = authR.data?.user?.email ?? null;
  const username = (profileR.data?.username as string | null) ?? null;
  if (!email && !username) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const confirm = body.data.confirm.trim();
  if (confirm !== email && confirm !== username) {
    return NextResponse.json(
      { error: "Confirmation text does not match the user's email or username." },
      { status: 400 }
    );
  }

  // Cancel a live Stripe subscription (best-effort — don't block deletion on it).
  let stripeCancelled = false;
  const subId = subR.data?.stripe_subscription_id as string | null | undefined;
  if (subId) {
    const stripe = getStripe();
    if (stripe) {
      try {
        await stripe.subscriptions.cancel(subId);
        stripeCancelled = true;
      } catch (err) {
        console.warn(`[admin] failed to cancel Stripe sub ${subId} during delete:`, err);
      }
    }
  }

  // Best-effort storage cleanup (uploaded publish media live under {user_id}/…).
  try {
    const { data: objects } = await admin.storage.from("publish-media").list(id);
    if (objects && objects.length > 0) {
      await admin.storage.from("publish-media").remove(objects.map((o) => `${id}/${o.name}`));
    }
  } catch (err) {
    console.warn(`[admin] storage cleanup failed for ${id}:`, err);
  }

  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) {
    return NextResponse.json({ error: `Failed to delete user: ${error.message}` }, { status: 500 });
  }

  await writeAudit(admin, {
    adminId: user.id,
    action: "user.delete",
    targetType: "user",
    targetId: id,
    payload: {
      email,
      username,
      reason: body.data.reason ?? null,
      stripeCancelled,
      subscription: subR.data ?? null,
    },
    ip,
    userAgent,
  });

  return NextResponse.json({ ok: true, stripeCancelled });
}
