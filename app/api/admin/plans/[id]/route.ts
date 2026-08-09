import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { guardAdminMutation, parseBody } from "@/lib/admin/mutation";
import { writeAudit } from "@/lib/admin/audit";
import {
  listAdminPlans,
  canPublish,
  canArchive,
  loweredEntitlements,
  type AdminPlanRow,
} from "@/lib/admin/plans";
import { invalidateCatalog } from "@/lib/billing/catalog";
import { coerceEntitlements } from "@/lib/billing/entitlements";
import { CURRENCIES } from "@/lib/billing/currency";
import { LOCALES } from "@/lib/i18n/config";

export const runtime = "nodejs";

// One plan: read it, edit it, publish it, archive it.
//
// Everything a customer sees about a plan is editable here EXCEPT its slug once
// anyone has subscribed — the slug is stored verbatim in subscriptions.tier, so
// renaming it would orphan those rows. There is deliberately no DELETE for the
// same reason; retiring a plan means archiving it.

const entitlementsSchema = z.object({
  accounts: z.number().int(),
  scripts_mo: z.number().int(),
  transcripts_mo: z.number().int(),
  automations: z.number().int(),
  publish_targets: z.number().int(),
  ig_connections: z.number().int(),
  model: z.enum(["haiku", "sonnet", "opus"]),
});

const copySchema = z.object({
  name: z.string().trim().max(60),
  tagline: z.string().trim().max(160).default(""),
  highlights: z.array(z.string().trim().min(1).max(120)).max(12).default([]),
  badge: z.string().trim().max(40).nullable().default(null),
});

const patchSchema = z.object({
  slug: z.string().regex(/^[a-z][a-z0-9_-]{1,31}$/).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  trialDays: z.number().int().min(0).max(365).optional(),
  defaultCurrency: z.enum(CURRENCIES).optional(),
  adminGrant: z.boolean().optional(),
  entitlements: entitlementsSchema.optional(),
  copy: z.record(z.enum(LOCALES), copySchema).optional(),
  // Publishing and archiving are separate, explicitly-named transitions rather
  // than a free-form status field, so each can carry its own guardrail.
  status: z.enum(["draft", "published", "archived"]).optional(),
  /** Acknowledges an entitlement reduction that affects existing subscribers. */
  confirmLoweredLimits: z.boolean().optional(),
});

async function findPlan(admin: Parameters<typeof listAdminPlans>[0], id: string): Promise<AdminPlanRow | null> {
  const plans = await listAdminPlans(admin);
  return plans.find((p) => p.id === id) ?? null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { id } = await params;

  const plan = await findPlan(gate.ctx.admin, id).catch(() => null);
  if (!plan) return NextResponse.json({ error: "Plan not found." }, { status: 404 });
  return NextResponse.json({ plan });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin, user, ip, userAgent } = gate.ctx;
  const { id } = await params;

  const over = await guardAdminMutation(gate.ctx);
  if (over) return over;

  const body = await parseBody(request, patchSchema);
  if (!body.ok) return body.response;
  const patch = body.data;

  const before = await findPlan(admin, id).catch(() => null);
  if (!before) return NextResponse.json({ error: "Plan not found." }, { status: 404 });

  // ── guardrails ─────────────────────────────────────────────────────────────
  if (patch.slug && patch.slug !== before.slug && before.slugLocked) {
    return NextResponse.json(
      {
        error:
          "This plan's slug is fixed: subscriptions already reference it, and renaming it would orphan them.",
      },
      { status: 409 }
    );
  }

  if (patch.status === "archived" && before.status !== "archived") {
    const guard = canArchive(before);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  if (patch.status === "published" && before.status !== "published") {
    // Validate against what the plan will look like AFTER this patch, not before
    // — otherwise "fill in the name and publish" in one request would be refused.
    const guard = canPublish({
      ...before,
      entitlements: patch.entitlements
        ? coerceEntitlements(patch.entitlements) ?? before.entitlements
        : before.entitlements,
      defaultCurrency: patch.defaultCurrency ?? before.defaultCurrency,
      copy: patch.copy ? { ...before.copy, ...patch.copy } : before.copy,
    });
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  // Entitlements are NOT grandfathered — they resolve live from the catalog, so
  // a reduction hits existing subscribers on their next page load. Allowed, but
  // never silently: the caller has to come back having acknowledged it.
  let lowered: string[] = [];
  if (patch.entitlements) {
    const next = coerceEntitlements(patch.entitlements);
    if (!next) {
      return NextResponse.json({ error: "Those limits aren't a valid entitlement set." }, { status: 400 });
    }
    lowered = loweredEntitlements(before.entitlements, next);
    if (lowered.length > 0 && before.subscribers > 0 && !patch.confirmLoweredLimits) {
      return NextResponse.json(
        {
          error: `This lowers ${lowered.join(", ")} for ${before.subscribers} existing subscriber${
            before.subscribers === 1 ? "" : "s"
          }. Unlike prices, limits are not grandfathered — the reduction applies to them immediately.`,
          needsConfirmation: true,
          lowered,
          subscribers: before.subscribers,
        },
        { status: 409 }
      );
    }
  }

  // ── write ──────────────────────────────────────────────────────────────────
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.slug !== undefined) update.slug = patch.slug;
  if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder;
  if (patch.trialDays !== undefined) update.trial_days = patch.trialDays;
  if (patch.defaultCurrency !== undefined) update.default_currency = patch.defaultCurrency;
  if (patch.entitlements !== undefined) update.entitlements = patch.entitlements;
  if (patch.status !== undefined) {
    update.status = patch.status;
    update.archived_at = patch.status === "archived" ? new Date().toISOString() : null;
  }

  // Only one plan may be the admin-grant plan; the unique index enforces it, so
  // clear the incumbent first rather than letting the write fail.
  if (patch.adminGrant === true && !before.adminGrant) {
    await admin.from("plans").update({ admin_grant: false }).eq("admin_grant", true);
    update.admin_grant = true;
  } else if (patch.adminGrant === false && before.adminGrant) {
    return NextResponse.json(
      { error: "Point admin access at another plan instead of clearing it — admins must resolve to something." },
      { status: 409 }
    );
  }

  const { error } = await admin.from("plans").update(update).eq("id", id);
  if (error) {
    return NextResponse.json({ error: `Could not save the plan: ${error.message}` }, { status: 500 });
  }

  if (patch.copy) {
    const rows = Object.entries(patch.copy).map(([locale, copy]) => ({
      plan_id: id,
      locale,
      name: copy.name,
      tagline: copy.tagline,
      highlights: copy.highlights,
      badge: copy.badge,
    }));
    const { error: copyError } = await admin
      .from("plan_copy")
      .upsert(rows, { onConflict: "plan_id,locale" });
    if (copyError) {
      return NextResponse.json({ error: `Could not save the plan copy: ${copyError.message}` }, { status: 500 });
    }
  }

  invalidateCatalog();

  const action =
    patch.status === "published" && before.status !== "published"
      ? "plan.publish"
      : patch.status === "archived" && before.status !== "archived"
        ? "plan.archive"
        : "plan.update";

  await writeAudit(admin, {
    adminId: user.id,
    action,
    targetType: "plan",
    targetId: id,
    payload: {
      slug: before.slug,
      before: {
        status: before.status,
        sortOrder: before.sortOrder,
        entitlements: before.entitlements,
        trialDays: before.trialDays,
        copy: before.copy,
      },
      after: patch,
      ...(lowered.length > 0 ? { loweredLimits: lowered, affectedSubscribers: before.subscribers } : {}),
    },
    ip,
    userAgent,
  });

  const after = await findPlan(admin, id).catch(() => null);
  return NextResponse.json({ ok: true, plan: after });
}
