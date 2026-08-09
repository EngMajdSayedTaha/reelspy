import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tierForStripePrice, type PriceTierResolver } from "@/lib/billing/plans";
import { isMissingResource } from "@/lib/billing/stripe";
import { ACTIVE_STATUSES } from "@/lib/billing/subscription";
import { isAiTier, type AiTier } from "@/lib/ai/tier";
import { coerceEntitlements, type Entitlements } from "@/lib/billing/entitlements";
import { readPendingChange, type PendingPlanChange } from "@/lib/billing/schedule";

// Shared Stripe→subscriptions sync, extracted from the webhook so BOTH the
// webhook (source of truth) and the admin "sync from Stripe" action write the
// row the same way. The subscriptions table stays single-shape regardless of
// which path touched it.

// "No paid access" is defined as the complement of ACTIVE_STATUSES rather than
// its own list, so the row we WRITE can never claim a tier that the read path
// (getSubscription) would refuse to honour. An allow-list is also the safe
// default for a status Stripe adds later: unknown ⇒ no access.
export function grantsAccess(status: string): boolean {
  return ACTIVE_STATUSES.has(status);
}

export function customerIdOf(sub: Stripe.Subscription): string | null {
  return typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
}

// Resolve which of OUR user ids a Stripe object belongs to: prefer the metadata
// stamped at checkout, else map the Stripe customer id back via the table.
export async function resolveUserId(
  admin: SupabaseClient,
  metadataUserId: string | undefined,
  customerId: string | null
): Promise<string | null> {
  if (metadataUserId) return metadataUserId;
  if (!customerId) return null;
  const { data } = await admin
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return data?.user_id ?? null;
}

export type { PriceTierResolver };

// Derive the tier a subscription grants: the priced plan wins (so a mid-cycle
// plan change is honoured), falling back to the tier stamped in metadata. A
// custom-plan subscription's ad-hoc price never matches a known Stripe Price id,
// so this naturally falls through to the "custom" tier stamped in metadata.
//
// `resolved: false` means NEITHER source recognised this subscription — which is
// very different from "this subscription grants nothing". Callers that are about
// to write a row must not treat an unrecognised price as free (see
// syncSubscription); callers that only need a label can use the `free` default.
export function resolveSubscriptionTier(
  sub: Stripe.Subscription,
  resolve: PriceTierResolver = tierForStripePrice
): { tier: AiTier; resolved: boolean } {
  const priceId = sub.items?.data?.[0]?.price?.id;
  const fromPrice = priceId ? resolve(priceId) : null;
  if (fromPrice) return { tier: fromPrice, resolved: true };
  const metaTier = sub.metadata?.tier;
  if (isAiTier(metaTier)) return { tier: metaTier, resolved: true };
  return { tier: "free", resolved: false };
}

export function tierOfSubscription(
  sub: Stripe.Subscription,
  resolve: PriceTierResolver = tierForStripePrice
): AiTier {
  return resolveSubscriptionTier(sub, resolve).tier;
}

// Parse the custom-plan config stamped into metadata at checkout (B4). Returns
// null on any parse/shape failure so callers fall back to ENTITLEMENTS.custom.
export function customEntitlementsOf(sub: Stripe.Subscription): Entitlements | null {
  const raw = sub.metadata?.custom_entitlements;
  if (!raw) return null;
  try {
    return coerceEntitlements(JSON.parse(raw));
  } catch {
    return null;
  }
}

// What the row looked like BEFORE this sync. The webhook diffs it against the
// freshly-written state to decide which lifecycle email to send (plan change
// applied, cancellation scheduled, subscription resumed…), which is the only way
// to notify correctly no matter where the change came from — our UI, the Stripe
// Billing Portal, or the Stripe dashboard.
export type PreviousState = {
  tier: AiTier;
  status: string;
  cancelAtPeriodEnd: boolean;
};

export type SyncResult = {
  userId: string;
  tier: AiTier;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  pending: PendingPlanChange | null | undefined;
  previous: PreviousState | null;
};

// Upsert the subscriptions row from a Stripe Subscription object. Throws on a DB
// error (the webhook turns that into a 500 so Stripe retries).
//
// Pass `stripe` to also refresh the cached deferred-plan-change columns from the
// subscription's schedule. Without it (or when Stripe errors) the pending_*
// columns are left exactly as they were rather than guessed at — a stale hint is
// recoverable, a wrongly-cleared one loses the user's scheduled change from the
// UI until the next sync.
export async function syncSubscription(
  admin: SupabaseClient,
  sub: Stripe.Subscription,
  stripe?: Stripe,
  resolve: PriceTierResolver = tierForStripePrice
): Promise<SyncResult | null> {
  const customerId = customerIdOf(sub);
  const userId = await resolveUserId(admin, sub.metadata?.user_id, customerId);
  if (!userId) {
    console.warn(`[billing/sync] no user for subscription ${sub.id} (customer ${customerId})`);
    return null;
  }

  const previous = await previousState(admin, userId);

  const inactive = !grantsAccess(sub.status);

  // An ACTIVE subscription whose price we don't recognise must never be written
  // as `free`: that silently strips a paying customer of everything they bought,
  // and it can't self-heal because the next sync makes the same mistake. Prices
  // legitimately go unrecognised — a price created outside the app, a test↔live
  // key switch, or (once prices are admin-managed) an older generation this
  // deployment hasn't loaded — so hold the tier the row already has and shout
  // about it instead. Only a genuinely inactive subscription drops to free.
  const resolvedTier = resolveSubscriptionTier(sub, resolve);
  let tier: AiTier = inactive ? "free" : resolvedTier.tier;
  if (!inactive && !resolvedTier.resolved) {
    const priceId = sub.items?.data?.[0]?.price?.id ?? "none";
    if (previous && previous.tier !== "free") {
      tier = previous.tier;
      console.error(
        `[billing/sync] unresolved price ${priceId} on active subscription ${sub.id} — keeping tier '${previous.tier}'`
      );
    } else {
      console.error(
        `[billing/sync] unresolved price ${priceId} on active subscription ${sub.id} — no previous tier to keep`
      );
    }
  }

  const customEntitlements = !inactive && tier === "custom" ? customEntitlementsOf(sub) : null;
  const periodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000).toISOString()
    : null;

  // undefined = "couldn't determine" (leave the cache alone); null = "provably
  // nothing scheduled" (clear it).
  let pending: PendingPlanChange | null | undefined;
  if (stripe) {
    try {
      pending = await readPendingChange(stripe, sub, resolve);
    } catch (err) {
      console.warn(
        "[billing/sync] pending change lookup failed:",
        err instanceof Error ? err.message : err
      );
    }
  }
  // A subscription that no longer grants access has nothing to change INTO.
  if (inactive) pending = null;

  const base = {
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    tier,
    status: sub.status,
    current_period_end: periodEnd,
    cancel_at_period_end: sub.cancel_at_period_end ?? false,
    custom_entitlements: customEntitlements,
    updated_at: new Date().toISOString(),
  };
  // Columns that arrived in migrations after the original billing one. Each is
  // optional, and each is DROPPABLE on a database that predates it — losing a
  // cache is survivable, losing the tier write is not. Ordered oldest-first;
  // upsertWithOptionalColumns drops from the end (newest first) until the write
  // lands, so a database missing only the newest migration keeps everything else.
  const optionalGroups: OptionalColumnGroup[] = [
    {
      name: "scheduled-change (20260729120000_scheduled_plan_changes.sql)",
      // undefined = "couldn't determine", so don't write the group at all.
      columns:
        pending !== undefined
          ? {
              stripe_schedule_id: pending?.scheduleId ?? null,
              pending_tier: pending?.tier ?? null,
              pending_effective_at: pending?.effectiveAt ?? null,
              pending_price_aed: pending?.priceAed ?? null,
              pending_custom_entitlements: pending?.entitlements ?? null,
            }
          : {},
    },
  ];

  await upsertWithOptionalColumns(admin, base, optionalGroups);
  return {
    userId,
    tier,
    status: sub.status,
    cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
    currentPeriodEnd: periodEnd,
    pending,
    previous,
  };
}

// One migration's worth of optional columns on the subscriptions row.
export type OptionalColumnGroup = {
  /** Human name (+ migration file) for the log line when the group is dropped. */
  name: string;
  columns: Record<string, unknown>;
};

// Write `base` plus as many optional column groups as the database actually has.
// On an unknown-column error we drop the NEWEST remaining group and retry, so a
// database that is one migration behind still gets every earlier column — and a
// database that is several behind degrades one step at a time instead of falling
// straight back to the bare row. Any other error is a real failure and throws
// (the webhook turns that into a 500 so Stripe retries).
async function upsertWithOptionalColumns(
  admin: SupabaseClient,
  base: Record<string, unknown>,
  groups: OptionalColumnGroup[]
): Promise<void> {
  const remaining = groups.filter((g) => Object.keys(g.columns).length > 0);

  for (;;) {
    const row = remaining.reduce((acc, g) => ({ ...acc, ...g.columns }), { ...base });
    const { error } = await admin.from("subscriptions").upsert(row, { onConflict: "user_id" });
    if (!error) return;
    if (!isUnknownColumn(error) || remaining.length === 0) {
      throw new Error(error.message);
    }
    const dropped = remaining.pop();
    console.warn(`[billing/sync] columns missing — dropping ${dropped?.name} and retrying`);
  }
}

// Postgres 42703 (undefined_column) / PostgREST PGRST204 (column not in schema
// cache) — i.e. "this database predates the migration", not "this write is bad".
function isUnknownColumn(error: { code?: string; message?: string }): boolean {
  if (error.code === "42703" || error.code === "PGRST204") return true;
  return /column .* does not exist|could not find the .* column/i.test(error.message ?? "");
}

// Best-effort read of the row as it stands right now. Null when there's no row
// yet (first checkout) or the lookup fails — callers treat that as "no history
// to diff against", which suppresses change emails rather than inventing one.
async function previousState(
  admin: SupabaseClient,
  userId: string
): Promise<PreviousState | null> {
  try {
    // Deliberately only columns from the original billing migration: this read
    // decides whether a lifecycle email goes out, and it must not go quiet on a
    // database that's missing a later migration.
    const { data } = await admin
      .from("subscriptions")
      .select("tier, status, cancel_at_period_end")
      .eq("user_id", userId)
      .maybeSingle();
    if (!data) return null;
    return {
      tier: isAiTier(data.tier) ? (data.tier as AiTier) : "free",
      status: typeof data.status === "string" ? data.status : "inactive",
      cancelAtPeriodEnd: Boolean(data.cancel_at_period_end),
    };
  } catch {
    return null;
  }
}

// Confirm a stored Stripe customer id is still usable before we hand it to
// Checkout or the Billing Portal. Stripe customers can disappear (deleted in the
// dashboard, or orphaned by a test↔live key switch), and passing a dead id makes
// every subsequent checkout fail with "No such customer" — a dead end the user
// can't escape from the UI. When the id is gone we clear it from our row so the
// next checkout mints a fresh customer instead.
export async function usableCustomerId(
  admin: SupabaseClient,
  stripe: Stripe,
  userId: string,
  customerId: string | null | undefined
): Promise<string | null> {
  if (!customerId) return null;
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (!(customer as Stripe.DeletedCustomer).deleted) return customerId;
  } catch (err) {
    if (!isMissingResource(err)) throw err;
  }
  console.warn(`[billing/sync] stale stripe customer ${customerId} for user ${userId} — clearing`);
  await admin
    .from("subscriptions")
    .update({ stripe_customer_id: null, stripe_subscription_id: null, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  return null;
}

// Admin action: re-pull a user's live subscription from Stripe and re-sync the
// row. Finds the Stripe subscription via the stored subscription/customer id.
// Returns a small result describing what happened (for audit + UI feedback).
export async function syncSubscriptionForUser(
  admin: SupabaseClient,
  stripe: Stripe,
  userId: string,
  resolve: PriceTierResolver = tierForStripePrice
): Promise<{ ok: boolean; reason?: string; tier?: AiTier; status?: string }> {
  const { data: row } = await admin
    .from("subscriptions")
    .select("stripe_subscription_id, stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();

  const subId = row?.stripe_subscription_id as string | null | undefined;
  const customerId = row?.stripe_customer_id as string | null | undefined;

  // Try the stored subscription id first, then fall back to "whatever this
  // customer has now". Either id can be stale, and a stale id must not abort the
  // sync — it just means we look one level up (or report "nothing found").
  let sub: Stripe.Subscription | null = null;
  if (subId) {
    try {
      sub = await stripe.subscriptions.retrieve(subId);
    } catch (err) {
      if (!isMissingResource(err)) throw err;
    }
  }
  if (!sub && customerId) {
    try {
      const list = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 1 });
      sub = list.data[0] ?? null;
    } catch (err) {
      if (!isMissingResource(err)) throw err;
    }
  }

  if (!sub) {
    return { ok: false, reason: "No Stripe subscription found for this user." };
  }

  // Ensure our user_id is carried so resolveUserId maps correctly.
  if (!sub.metadata?.user_id) {
    sub.metadata = { ...sub.metadata, user_id: userId };
  }
  const result = await syncSubscription(admin, sub, stripe, resolve);
  if (!result) return { ok: false, reason: "Could not resolve the user for this subscription." };
  return { ok: true, tier: result.tier, status: result.status };
}
