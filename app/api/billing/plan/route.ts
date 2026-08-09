import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/billing/stripe";
import { getSubscription } from "@/lib/billing/subscription";
import { planDisplayName } from "@/lib/billing/catalog";
import { dayLabel } from "@/lib/billing/format";
import {
  cancelScheduledChangeForUser,
  requireActiveSubscription,
  setSubscriptionCancellation,
} from "@/lib/billing/plan-change";

// Subscription management the billing page owns in-app, so the three decisions
// with real money attached don't require a trip to the Stripe portal:
//
//   keep_current — call off a scheduled plan change; today's plan keeps renewing
//   cancel       — end the subscription when the paid period runs out
//   resume       — take that cancellation back
//
// Nothing here ever ends access early: cancelling keeps the plan alive until the
// period the customer paid for is over (Stripe's cancel_at_period_end), and the
// confirmation copy in the UI promises exactly that.

const bodySchema = z.object({
  action: z.enum(["keep_current", "cancel", "resume"]),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Billing isn't available yet." }, { status: 503 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Unknown billing action." }, { status: 400 });
  }

  const admin = createAdminClient();
  const sub = await getSubscription(admin, user.id);
  const guard = requireActiveSubscription(sub);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const shared = { admin, stripe, userId: user.id, subscriptionId: guard.subscriptionId };

  if (parsed.data.action === "keep_current") {
    const result = await cancelScheduledChangeForUser(shared);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ kept: true, tierName: result.tierName });
  }

  const cancel = parsed.data.action === "cancel";
  const result = await setSubscriptionCancellation({ ...shared, cancel });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({
    cancelAtPeriodEnd: result.cancelAtPeriodEnd,
    accessUntil: result.accessUntil,
    accessUntilLabel: dayLabel(result.accessUntil),
    tierName: await planDisplayName(sub?.tier ?? "free"),
  });
}
