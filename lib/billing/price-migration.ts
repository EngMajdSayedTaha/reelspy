// Moving existing subscribers onto a new price.
//
// Editing a plan's price never touches anyone already subscribed — that is the
// whole grandfathering promise. This is the separate, explicit, audited action
// that DOES move them, and its single most important property is:
//
//   IT NEVER CHARGES ANYBODY TODAY.
//
// That is why each job calls schedulePlanChange directly and never
// changePlanForUser. changePlanForUser runs decidePlanChangeMode, which would
// see a higher price, decide "upgrade ⇒ immediate", and invoice a prorated
// amount mid-cycle — a surprise charge to every subscriber at once, and the
// exact opposite of what grandfathering promised them. A migration ALWAYS
// defers, regardless of direction.
//
// Each subscriber gets their own job so a failure is per-user and retryable,
// rather than one bad row failing the batch.

import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ACTIVE_STATUSES } from "@/lib/billing/subscription";
import { schedulePlanChange } from "@/lib/billing/schedule";
import { emailForUser } from "@/lib/billing/notify";
import { sendPriceChangeNotice } from "@/lib/email/billing";
import { dayLabel } from "@/lib/billing/format";
import { enqueueJob } from "@/lib/jobs/queue";
import { loadCatalog, planName } from "@/lib/billing/catalog";
import { formatPrice, normalizeCurrency } from "@/lib/billing/currency";

// A migration touching more than this is almost certainly a mistake, and it
// would be a lot of Stripe writes to undo.
export const MAX_MIGRATION_BATCH = 5000;

export type MigrationTarget = { userId: string; subscriptionId: string; periodEnd: string | null };

// Who is still on the old price: active subscribers whose subscription bills the
// price we're moving away from. One indexed query, thanks to
// subscriptions.stripe_price_id.
export async function findMigrationTargets(
  admin: SupabaseClient,
  fromStripePriceId: string
): Promise<MigrationTarget[]> {
  const { data, error } = await admin
    .from("subscriptions")
    .select("user_id, stripe_subscription_id, current_period_end, status")
    .eq("stripe_price_id", fromStripePriceId)
    .in("status", [...ACTIVE_STATUSES])
    .limit(MAX_MIGRATION_BATCH);

  if (error) throw new Error(error.message);

  return ((data ?? []) as {
    user_id: string;
    stripe_subscription_id: string | null;
    current_period_end: string | null;
  }[])
    .filter((r) => r.stripe_subscription_id)
    .map((r) => ({
      userId: r.user_id,
      subscriptionId: r.stripe_subscription_id!,
      periodEnd: r.current_period_end,
    }));
}

// The date a subscriber's new price starts: their first renewal that is at least
// `noticeDays` away. Anyone renewing sooner keeps the old price for one more
// period — nobody's price changes with less notice than promised, which is both
// the decent thing and what consumer-protection rules in most markets expect.
export function effectiveDateFor(
  periodEnd: string | null,
  noticeDays: number,
  now: Date = new Date()
): { effectiveAt: Date | null; deferred: boolean } {
  if (!periodEnd) return { effectiveAt: null, deferred: false };
  const end = new Date(periodEnd);
  if (Number.isNaN(end.getTime())) return { effectiveAt: null, deferred: false };

  const earliest = new Date(now.getTime() + noticeDays * 24 * 60 * 60 * 1000);
  if (end >= earliest) return { effectiveAt: end, deferred: false };
  // Too soon: this renewal passes at the old price and we revisit afterwards.
  return { effectiveAt: null, deferred: true };
}

export type EnqueueResult = { queued: number; skipped: number };

export async function enqueueMigrationJobs(
  admin: SupabaseClient,
  migrationId: string,
  targets: MigrationTarget[]
): Promise<EnqueueResult> {
  let queued = 0;
  let skipped = 0;

  await admin.from("plan_price_migration_targets").upsert(
    targets.map((t) => ({ migration_id: migrationId, user_id: t.userId, status: "pending" })),
    { onConflict: "migration_id,user_id" }
  );

  for (const target of targets) {
    const { skipped: dup } = await enqueueJob(admin, {
      kind: "migrate_plan_price",
      payload: { migrationId, userId: target.userId, subscriptionId: target.subscriptionId },
      userId: target.userId,
      dedupKey: `planprice:${migrationId}:${target.userId}`,
    });
    if (dup) skipped += 1;
    else queued += 1;
  }

  return { queued, skipped };
}

export type MigrationJobOutcome = "scheduled" | "skipped" | "deferred";

// Move ONE subscriber. Returns what happened so the worker can record it.
export async function runPriceMigration(
  admin: SupabaseClient,
  stripe: Stripe,
  payload: { migrationId: string; userId: string; subscriptionId: string }
): Promise<MigrationJobOutcome> {
  const { migrationId, userId, subscriptionId } = payload;

  const { data: migration } = await admin
    .from("plan_price_migrations")
    .select("id, plan_id, to_price_id, notice_days, status")
    .eq("id", migrationId)
    .maybeSingle();

  // Cancelling a migration makes every job still in the queue a no-op.
  if (!migration || migration.status === "cancelled") {
    return "skipped";
  }

  const { data: toPrice } = await admin
    .from("plan_prices")
    .select("id, stripe_price_id, unit_amount, currency, interval, plan_id")
    .eq("id", migration.to_price_id)
    .maybeSingle();
  if (!toPrice) return "skipped";

  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  // Cancelled since the batch was built, or already moved by something else.
  if (!ACTIVE_STATUSES.has(sub.status)) return "skipped";
  if (sub.items?.data?.[0]?.price?.id === toPrice.stripe_price_id) return "skipped";

  const periodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000).toISOString()
    : null;
  const { effectiveAt, deferred } = effectiveDateFor(periodEnd, migration.notice_days ?? 30);
  if (deferred) {
    // Their renewal is sooner than the notice period allows. Re-queue for just
    // after it, so they move at the FOLLOWING renewal with full notice.
    await enqueueJob(admin, {
      kind: "migrate_plan_price",
      payload,
      userId,
      runAt: new Date(new Date(periodEnd!).getTime() + 60 * 60 * 1000),
      dedupKey: `planprice:${migrationId}:${userId}:next`,
    });
    await recordTarget(admin, migrationId, userId, "pending", null, null);
    return "deferred";
  }

  const catalog = await loadCatalog();
  const slug =
    catalog.priceIndex.get(toPrice.stripe_price_id as string)?.slug ??
    catalog.plans.find((p) => p.id === toPrice.plan_id)?.slug ??
    "";

  // ALWAYS the scheduled path. See the note at the top of this file.
  const pending = await schedulePlanChange(stripe, subscriptionId, {
    userId,
    tier: slug,
    priceId: toPrice.stripe_price_id as string,
    priceAed: null,
    amountMinor: toPrice.unit_amount as number,
    currency: toPrice.currency as string,
    interval: (toPrice.interval as "month" | "year") ?? "month",
    entitlements: null,
  });

  // Tell them before it happens, with the old price, the new price and the date.
  const to = await emailForUser(admin, userId);
  if (to) {
    const oldPrice = sub.items?.data?.[0]?.price;
    const currency = normalizeCurrency(toPrice.currency) ?? "aed";
    await sendPriceChangeNotice({
      to,
      tierName: planName(catalog, slug),
      oldPriceLabel:
        oldPrice?.unit_amount != null
          ? formatPrice(oldPrice.unit_amount, normalizeCurrency(oldPrice.currency) ?? currency)
          : null,
      newPriceLabel: formatPrice(toPrice.unit_amount as number, currency),
      effectiveOnLabel: dayLabel(pending.effectiveAt) ?? dayLabel(effectiveAt),
    });
  }

  await recordTarget(admin, migrationId, userId, "scheduled", pending.effectiveAt, null);
  return "scheduled";
}

export async function recordTarget(
  admin: SupabaseClient,
  migrationId: string,
  userId: string,
  status: "pending" | "notified" | "scheduled" | "failed" | "skipped",
  effectiveAt: string | null,
  error: string | null
): Promise<void> {
  await admin.from("plan_price_migration_targets").upsert(
    {
      migration_id: migrationId,
      user_id: userId,
      status,
      effective_at: effectiveAt,
      error,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "migration_id,user_id" }
  );
}

// Roll the per-target outcomes up onto the migration row, so the admin UI can
// show progress without counting rows on every render.
export async function refreshMigrationCounts(
  admin: SupabaseClient,
  migrationId: string
): Promise<void> {
  const { data } = await admin
    .from("plan_price_migration_targets")
    .select("status")
    .eq("migration_id", migrationId);

  const rows = (data ?? []) as { status: string }[];
  const succeeded = rows.filter((r) => r.status === "scheduled" || r.status === "skipped").length;
  const failed = rows.filter((r) => r.status === "failed").length;
  const done = succeeded + failed >= rows.length && rows.length > 0;

  await admin
    .from("plan_price_migrations")
    .update({
      total: rows.length,
      succeeded,
      failed,
      ...(done ? { status: "done", completed_at: new Date().toISOString() } : { status: "running" }),
    })
    .eq("id", migrationId);
}
