import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { guardAdminMutation, parseBody } from "@/lib/admin/mutation";
import { writeAudit } from "@/lib/admin/audit";
import { listAdminPlans } from "@/lib/admin/plans";
import { getStripe } from "@/lib/billing/stripe";
import { invalidateCatalog } from "@/lib/billing/catalog";
import { mintPlanPrice, validatePriceInput, subscribersOnPrice } from "@/lib/billing/plan-prices";
import { CURRENCIES } from "@/lib/billing/currency";

export const runtime = "nodejs";

// Set a plan's price.
//
// This CREATES a Stripe Price rather than editing one, because Stripe Prices are
// immutable in amount — and that is what makes the promise this endpoint keeps:
// nobody already subscribed is repriced. Their subscription still points at the
// price they signed up on, which stays resolvable forever. Moving them is a
// separate, explicit action.

const bodySchema = z.object({
  interval: z.enum(["month", "year"]).default("month"),
  currency: z.enum(CURRENCIES).default("aed"),
  /** MINOR units — 14900 is AED 149.00. */
  unitAmount: z.number().int().positive(),
  compareAtAmount: z.number().int().positive().nullable().optional(),
  saleEndsAt: z.string().datetime().nullable().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { admin, user, ip, userAgent } = gate.ctx;
  const { id } = await params;

  const over = await guardAdminMutation(gate.ctx);
  if (over) return over;

  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.response;
  const input = body.data;

  const valid = validatePriceInput(input);
  if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 });

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe isn't configured." }, { status: 503 });
  }

  const plans = await listAdminPlans(admin).catch(() => null);
  const plan = plans?.find((p) => p.id === id);
  if (!plan) return NextResponse.json({ error: "Plan not found." }, { status: 404 });

  if (plan.kind === "free") {
    return NextResponse.json({ error: "The free plan can't have a price." }, { status: 409 });
  }
  if (plan.kind === "custom") {
    return NextResponse.json(
      { error: "The build-your-own plan prices each configuration itself — it has no fixed price." },
      { status: 409 }
    );
  }

  let result: Awaited<ReturnType<typeof mintPlanPrice>>;
  try {
    result = await mintPlanPrice(admin, stripe, {
      planId: plan.id,
      slug: plan.slug,
      stripeProductId: plan.stripeProductId,
      planName: plan.copy.en.name || plan.slug,
      interval: input.interval,
      currency: input.currency,
      unitAmount: input.unitAmount,
      compareAtAmount: input.compareAtAmount ?? null,
      saleEndsAt: input.saleEndsAt ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Could not create the price: ${err instanceof Error ? err.message : "unknown error"}` },
      { status: 502 }
    );
  }

  invalidateCatalog();

  // How many people the change deliberately did NOT touch. The UI turns this
  // into the "migrate N subscribers" offer.
  const grandfathered = result.replaced ? await subscribersOnPrice(admin, result.replaced.stripePriceId) : 0;

  await writeAudit(admin, {
    adminId: user.id,
    action: "plan.price.create",
    targetType: "plan",
    targetId: plan.id,
    payload: {
      slug: plan.slug,
      interval: input.interval,
      currency: input.currency,
      before: result.replaced,
      after: { stripePriceId: result.stripePriceId, unitAmount: input.unitAmount },
      grandfathered,
    },
    ip,
    userAgent,
  });

  return NextResponse.json({
    ok: true,
    stripePriceId: result.stripePriceId,
    replaced: result.replaced,
    grandfathered,
  });
}
