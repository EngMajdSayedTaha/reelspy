import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { guardAdminMutation, parseBody } from "@/lib/admin/mutation";
import { writeAudit } from "@/lib/admin/audit";
import { listAdminPlans, type AdminPlanRow } from "@/lib/admin/plans";
import { invalidateCatalog } from "@/lib/billing/catalog";
import { coerceEntitlements, DEFAULT_CUSTOM_ENTITLEMENTS } from "@/lib/billing/entitlements";
import { CURRENCIES } from "@/lib/billing/currency";
import { LOCALES } from "@/lib/i18n/config";

export const runtime = "nodejs";

// The plan catalog, for the admin console.
//
// GET returns every plan — drafts and archived ones included, since those are
// exactly what the admin needs to see and revive — with subscriber counts, which
// is what the destructive actions are gated on.
//
// POST creates a plan as a DRAFT. Draft plans are invisible to customers and
// rejected by checkout, so a plan can be built and reviewed in full before it
// ever becomes purchasable; publishing is a separate, audited action.

export type { AdminPlanRow };

export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;

  try {
    const plans = await listAdminPlans(gate.ctx.admin);
    return NextResponse.json({ plans, currencies: CURRENCIES, locales: LOCALES });
  } catch (err) {
    // Almost always "the catalog migration hasn't been applied here yet", which
    // is worth saying plainly rather than rendering an empty console.
    return NextResponse.json(
      {
        error: `Could not read the plan catalog: ${err instanceof Error ? err.message : "unknown error"}`,
      },
      { status: 503 }
    );
  }
}

const SLUG_RE = /^[a-z][a-z0-9_-]{1,31}$/;

const createSchema = z.object({
  slug: z.string().regex(SLUG_RE, "Use lower-case letters, digits, - or _ (2-32 chars)."),
  kind: z.enum(["fixed", "custom"]).default("fixed"),
  name: z.string().trim().min(1).max(60),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin, user, ip, userAgent } = gate.ctx;

  const over = await guardAdminMutation(gate.ctx);
  if (over) return over;

  const body = await parseBody(request, createSchema);
  if (!body.ok) return body.response;
  const { slug, kind, name, sortOrder } = body.data;

  const { data: existing } = await admin.from("plans").select("id").eq("slug", slug).maybeSingle();
  if (existing) {
    return NextResponse.json({ error: `A plan with the slug "${slug}" already exists.` }, { status: 409 });
  }

  // New plans start from the Creator-level defaults rather than empty, so the
  // editor opens on something coherent and a mis-saved plan can't grant nothing.
  const entitlements = coerceEntitlements(DEFAULT_CUSTOM_ENTITLEMENTS);

  const { data: created, error } = await admin
    .from("plans")
    .insert({
      slug,
      kind,
      status: "draft",
      sort_order: sortOrder ?? 100,
      entitlements,
      default_currency: "aed",
    })
    .select("id, slug")
    .maybeSingle();

  if (error || !created) {
    return NextResponse.json(
      { error: `Could not create the plan: ${error?.message ?? "unknown error"}` },
      { status: 500 }
    );
  }

  // Seed both locales so the editor never renders an undefined name; the admin
  // translates from there.
  await admin.from("plan_copy").insert(
    LOCALES.map((locale) => ({ plan_id: created.id, locale, name, tagline: "", highlights: [] }))
  );

  invalidateCatalog();

  await writeAudit(admin, {
    adminId: user.id,
    action: "plan.create",
    targetType: "plan",
    targetId: created.id,
    payload: { after: { slug, kind, name, status: "draft" } },
    ip,
    userAgent,
  });

  return NextResponse.json({ ok: true, id: created.id, slug: created.slug });
}
