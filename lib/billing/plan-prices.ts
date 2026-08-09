// Minting and retiring plan prices.
//
// Stripe Prices are IMMUTABLE in amount, so "changing a plan's price" is really
// "create a new Price and stop offering the old one". That constraint is not a
// nuisance — it is exactly what makes grandfathering work, and this module is
// built around it:
//
//   - a price edit CREATES a Stripe Price and a new plan_prices row, and demotes
//     the previous row to is_current = false;
//   - the demoted row is KEPT, with archived_at still null, because it is still
//     a live price for every subscriber on it. The catalog's reverse lookup
//     indexes it so the webhook keeps resolving those subscribers' plan;
//   - the old Stripe Price is NEVER deactivated. Deactivating one doesn't touch
//     existing subscriptions, but it does stop Subscription Schedules from using
//     it — and buildPhases reproduces the customer's CURRENT phase with their
//     current price id. Deactivating would leave every grandfathered subscriber
//     unable to schedule any plan change at all.
//
// Nobody is repriced by an edit. Moving existing subscribers is a separate,
// explicit, audited action.

import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Currency } from "@/lib/billing/currency";
import type { BillingInterval } from "@/lib/billing/catalog";

export type MintPriceInput = {
  planId: string;
  slug: string;
  /** Existing Stripe Product for this plan; one is created when absent. */
  stripeProductId: string | null;
  planName: string;
  interval: BillingInterval;
  currency: Currency;
  /** MINOR units (fils/cents), matching Stripe exactly. */
  unitAmount: number;
  /** Optional struck-through "was" figure. Display only. */
  compareAtAmount?: number | null;
  saleEndsAt?: string | null;
};

export type MintPriceResult = {
  priceId: string;
  stripePriceId: string;
  stripeProductId: string;
  /** The row this one replaced, if any — what the admin may now migrate off. */
  replaced: { id: string; stripePriceId: string; unitAmount: number } | null;
};

// A floor, in MINOR units, below which an amount is far more likely to be a
// mistake than an intention — specifically major units typed into a minor-unit
// field, which turns AED 149 into AED 1.49. It has to sit above the plausible
// typo range to catch that at all: a 1.00 floor would wave 149 straight through.
// 5.00 is below any plan ReelSpy sells and above every realistic slip. Raise or
// lower it here if a genuinely cheaper plan is ever wanted.
export const MIN_UNIT_AMOUNT_MINOR = 500;

export type PriceValidation = { ok: true } | { ok: false; error: string };

export function validatePriceInput(input: {
  unitAmount: number;
  compareAtAmount?: number | null;
}): PriceValidation {
  if (!Number.isInteger(input.unitAmount) || input.unitAmount <= 0) {
    return { ok: false, error: "Enter a price greater than zero." };
  }
  if (input.unitAmount < MIN_UNIT_AMOUNT_MINOR) {
    return {
      ok: false,
      error: `That works out to ${(input.unitAmount / 100).toFixed(2)} — under the ${(
        MIN_UNIT_AMOUNT_MINOR / 100
      ).toFixed(
        2
      )} minimum. Prices are in minor units (fils/cents), so 149.00 is 14900. Charge less than this on purpose? Lower MIN_UNIT_AMOUNT_MINOR.`,
    };
  }
  if (input.compareAtAmount != null && input.compareAtAmount <= input.unitAmount) {
    return { ok: false, error: "The 'was' price has to be higher than the price you're charging." };
  }
  return { ok: true };
}

// One Stripe Product per plan, reused across every price generation, so a
// coupon restricted to this plan keeps applying after a price change.
async function ensureProduct(
  stripe: Stripe,
  admin: SupabaseClient,
  planId: string,
  slug: string,
  planName: string,
  existing: string | null
): Promise<string> {
  if (existing) {
    try {
      const product = await stripe.products.retrieve(existing);
      if (!product.deleted) return existing;
    } catch {
      // Deleted in the dashboard, or a test/live key switch — mint a fresh one
      // rather than dead-ending every future price edit on a stale id.
    }
  }
  const product = await stripe.products.create({
    name: `ReelSpy ${planName}`,
    metadata: { plan_slug: slug },
  });
  await admin.from("plans").update({ stripe_product_id: product.id }).eq("id", planId);
  return product.id;
}

export async function mintPlanPrice(
  admin: SupabaseClient,
  stripe: Stripe,
  input: MintPriceInput
): Promise<MintPriceResult> {
  const productId = await ensureProduct(
    stripe,
    admin,
    input.planId,
    input.slug,
    input.planName,
    input.stripeProductId
  );

  // The row this replaces, read BEFORE we write, so the caller can offer to
  // migrate the subscribers still on it.
  const { data: previous } = await admin
    .from("plan_prices")
    .select("id, stripe_price_id, unit_amount")
    .eq("plan_id", input.planId)
    .eq("interval", input.interval)
    .eq("currency", input.currency)
    .eq("is_current", true)
    .maybeSingle();

  // A stable lookup key that always points at whatever is current, so ops can
  // reference a plan's live price without chasing ids. transfer_lookup_key moves
  // it off the old price rather than colliding with it.
  const lookupKey = `reelspy_${input.slug}_${input.interval}_${input.currency}`;
  const price = await stripe.prices.create({
    product: productId,
    currency: input.currency,
    unit_amount: input.unitAmount,
    recurring: { interval: input.interval },
    lookup_key: lookupKey,
    transfer_lookup_key: true,
    metadata: { plan_slug: input.slug },
  });

  // Demote first: the partial unique index allows only one current price per
  // (plan, interval, currency), so the insert would fail while the old row still
  // holds the slot. archived_at stays NULL — the old price is retired from sale,
  // not dead: subscribers are still billing on it.
  if (previous) {
    const { error } = await admin
      .from("plan_prices")
      .update({ is_current: false })
      .eq("id", previous.id);
    if (error) throw new Error(`Could not retire the previous price: ${error.message}`);
  }

  const { data: inserted, error } = await admin
    .from("plan_prices")
    .insert({
      plan_id: input.planId,
      interval: input.interval,
      currency: input.currency,
      unit_amount: input.unitAmount,
      compare_at_amount: input.compareAtAmount ?? null,
      sale_ends_at: input.saleEndsAt ?? null,
      stripe_price_id: price.id,
      is_current: true,
    })
    .select("id")
    .maybeSingle();

  if (error || !inserted) {
    // Put the old price back so the plan isn't left with nothing current — a
    // plan with no current price can't be bought at all.
    if (previous) {
      await admin.from("plan_prices").update({ is_current: true }).eq("id", previous.id);
    }
    throw new Error(`Could not save the new price: ${error?.message ?? "unknown error"}`);
  }

  return {
    priceId: inserted.id,
    stripePriceId: price.id,
    stripeProductId: productId,
    replaced: previous
      ? {
          id: previous.id as string,
          stripePriceId: previous.stripe_price_id as string,
          unitAmount: previous.unit_amount as number,
        }
      : null,
  };
}

// Active subscribers still billing on a specific Stripe Price — i.e. exactly who
// a price change did NOT touch, and who a migration would move.
export async function subscribersOnPrice(
  admin: SupabaseClient,
  stripePriceId: string
): Promise<number> {
  const { ACTIVE_STATUSES } = await import("@/lib/billing/subscription");
  const { count } = await admin
    .from("subscriptions")
    .select("user_id", { count: "exact", head: true })
    .eq("stripe_price_id", stripePriceId)
    .in("status", [...ACTIVE_STATUSES]);
  return count ?? 0;
}
