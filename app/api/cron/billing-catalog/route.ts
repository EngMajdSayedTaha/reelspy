import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cronAuthorized } from "@/lib/utils/cron";
import { invalidateCatalog } from "@/lib/billing/catalog";

export const runtime = "nodejs";

// Ends expired sales.
//
// A sale is a real price with a "was" figure beside it, and `reverts_to_price_id`
// records which price it should hand back to. When the sale's end date passes,
// this promotes that price back to current and demotes the sale one.
//
// EXISTING SUBSCRIBERS ON THE SALE PRICE ARE UNTOUCHED — that's the point, and
// it is the same grandfathering the ordinary price-change path relies on: the
// demoted row stays un-archived so the catalog keeps resolving it.
//
// The strikethrough itself does NOT depend on this running: the catalog treats
// compare_at_amount as null once sale_ends_at has passed, so a missed run can
// only leave the sale price live a bit longer — never advertise a discount that
// has actually expired.

type ExpiredSale = {
  id: string;
  plan_id: string;
  interval: string;
  currency: string;
  reverts_to_price_id: string;
};

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await admin
    .from("plan_prices")
    .select("id, plan_id, interval, currency, reverts_to_price_id")
    .eq("is_current", true)
    .not("reverts_to_price_id", "is", null)
    .lt("sale_ends_at", nowIso);

  if (error) {
    // A database without the catalog migration has nothing to expire.
    return NextResponse.json({ ok: true, skipped: error.message });
  }

  const expired = (data ?? []) as ExpiredSale[];
  const reverted: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  for (const sale of expired) {
    // Demote the sale FIRST: only one price per (plan, interval, currency) may
    // be current, so promoting the target while the sale still holds the slot
    // would violate the unique index.
    const demote = await admin.from("plan_prices").update({ is_current: false }).eq("id", sale.id);
    if (demote.error) {
      failed.push({ id: sale.id, reason: demote.error.message });
      continue;
    }

    const promote = await admin
      .from("plan_prices")
      .update({ is_current: true })
      .eq("id", sale.reverts_to_price_id);
    if (promote.error) {
      // Put the sale back rather than leave the plan with no current price,
      // which would make it unbuyable.
      await admin.from("plan_prices").update({ is_current: true }).eq("id", sale.id);
      failed.push({ id: sale.id, reason: promote.error.message });
      continue;
    }

    reverted.push(sale.id);
  }

  if (reverted.length > 0) invalidateCatalog();
  if (failed.length > 0) {
    console.error("[cron/billing-catalog] could not revert some sales:", failed);
  }

  return NextResponse.json({ ok: true, reverted: reverted.length, failed: failed.length });
}
