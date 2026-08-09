import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { guardAdminMutation, parseBody } from "@/lib/admin/mutation";
import { writeAudit } from "@/lib/admin/audit";
import { listAdminPlans } from "@/lib/admin/plans";
import {
  findMigrationTargets,
  enqueueMigrationJobs,
  MAX_MIGRATION_BATCH,
} from "@/lib/billing/price-migration";

export const runtime = "nodejs";

// Move the subscribers still on an old price onto the current one.
//
// Editing a price never touches them — this is the separate action that does,
// and it applies at each subscriber's OWN next renewal, after a notice period,
// never today. GET is a dry run so the admin sees the count before committing.

const bodySchema = z.object({
  fromPriceId: z.string().uuid(),
  toPriceId: z.string().uuid(),
  noticeDays: z.number().int().min(0).max(180).default(30),
});

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin } = gate.ctx;
  const { id } = await params;

  const url = new URL(request.url);
  const fromPriceId = url.searchParams.get("fromPriceId");
  if (!fromPriceId) return NextResponse.json({ error: "fromPriceId is required." }, { status: 400 });

  const plans = await listAdminPlans(admin).catch(() => null);
  const plan = plans?.find((p) => p.id === id);
  const from = plan?.prices.find((p) => p.id === fromPriceId);
  if (!plan || !from) return NextResponse.json({ error: "Price not found." }, { status: 404 });

  const targets = await findMigrationTargets(admin, from.stripePriceId).catch(() => []);
  return NextResponse.json({ count: targets.length, max: MAX_MIGRATION_BATCH });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin, user, ip, userAgent } = gate.ctx;
  const { id } = await params;

  const over = await guardAdminMutation(gate.ctx);
  if (over) return over;

  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.response;
  const { fromPriceId, toPriceId, noticeDays } = body.data;

  const plans = await listAdminPlans(admin).catch(() => null);
  const plan = plans?.find((p) => p.id === id);
  if (!plan) return NextResponse.json({ error: "Plan not found." }, { status: 404 });

  const from = plan.prices.find((p) => p.id === fromPriceId);
  const to = plan.prices.find((p) => p.id === toPriceId);
  if (!from || !to) {
    return NextResponse.json({ error: "Both prices have to belong to this plan." }, { status: 404 });
  }

  // Guardrails. A migration that changes anything other than the amount is not a
  // repricing — it's a different plan change wearing its clothes, and it would
  // move subscribers to a currency or billing period they never agreed to.
  if (from.currency !== to.currency || from.interval !== to.interval) {
    return NextResponse.json(
      {
        error:
          "A price migration can only change the amount. Moving subscribers to a different currency or billing period isn't something this can do safely.",
      },
      { status: 409 }
    );
  }
  if (!to.isCurrent) {
    return NextResponse.json(
      { error: "Migrate subscribers onto the CURRENT price, not an older one." },
      { status: 409 }
    );
  }
  if (from.id === to.id) {
    return NextResponse.json({ error: "They're already on that price." }, { status: 409 });
  }

  let targets;
  try {
    targets = await findMigrationTargets(admin, from.stripePriceId);
  } catch (err) {
    return NextResponse.json(
      { error: `Could not work out who to migrate: ${err instanceof Error ? err.message : "unknown"}` },
      { status: 500 }
    );
  }

  if (targets.length === 0) {
    return NextResponse.json({ error: "Nobody is on that price." }, { status: 409 });
  }
  if (targets.length > MAX_MIGRATION_BATCH) {
    return NextResponse.json(
      { error: `That's ${targets.length} subscribers — over the ${MAX_MIGRATION_BATCH} limit.` },
      { status: 409 }
    );
  }

  const { data: migration, error } = await admin
    .from("plan_price_migrations")
    .insert({
      plan_id: plan.id,
      from_price_id: from.id,
      to_price_id: to.id,
      notice_days: noticeDays,
      status: "running",
      total: targets.length,
      created_by: user.id,
    })
    .select("id")
    .maybeSingle();

  if (error || !migration) {
    return NextResponse.json(
      { error: `Could not start the migration: ${error?.message ?? "unknown error"}` },
      { status: 500 }
    );
  }

  const { queued, skipped } = await enqueueMigrationJobs(admin, migration.id, targets);

  // ONE audit entry for the batch. Per-subscriber outcomes live in
  // plan_price_migration_targets — writing 500 audit rows would bury everything
  // else in the log.
  await writeAudit(admin, {
    adminId: user.id,
    action: "billing.price_migration.create",
    targetType: "plan",
    targetId: plan.id,
    payload: {
      slug: plan.slug,
      migrationId: migration.id,
      from: { id: from.id, stripePriceId: from.stripePriceId, unitAmount: from.unitAmount },
      to: { id: to.id, stripePriceId: to.stripePriceId, unitAmount: to.unitAmount },
      noticeDays,
      subscribers: targets.length,
    },
    ip,
    userAgent,
  });

  return NextResponse.json({ ok: true, migrationId: migration.id, queued, skipped });
}
