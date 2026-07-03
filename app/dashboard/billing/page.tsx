import { redirect } from "next/navigation";
import { Check, CheckCircle2, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { resolveUserTier } from "@/lib/ai/tier";
import { getSubscription } from "@/lib/billing/subscription";
import { entitlementsFor, formatLimit, isUnlimited } from "@/lib/billing/entitlements";
import { PLANS, planFor, isPaidTier, type PaidTier } from "@/lib/billing/plans";
import { stripeConfigured } from "@/lib/billing/stripe";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SubscribeButton, ManageBillingButton } from "@/components/billing/BillingActions";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

// Read this user's usage for the current calendar month for one RPC action.
async function monthlyUsed(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  action: string
): Promise<number> {
  const period = new Date();
  const monthStart = new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
  const { data } = await supabase
    .from("user_monthly_usage")
    .select("call_count")
    .eq("user_id", userId)
    .eq("action", action)
    .eq("period_month", monthStart)
    .maybeSingle();
  return data?.call_count ?? 0;
}

async function count(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  userId: string
): Promise<number> {
  const { count: c } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  return c ?? 0;
}

function UsageRow({ label, used, limit }: { label: string; used: number; limit: number }) {
  const unlimited = isUnlimited(limit);
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  const atCap = !unlimited && used >= limit;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-foreground">{label}</span>
        <span className={atCap ? "font-medium text-destructive" : "text-muted-foreground"}>
          {used} / {formatLimit(limit)}
        </span>
      </div>
      {!unlimited ? (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full ${atCap ? "bg-destructive" : "bg-primary"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : (
        <div className="h-1.5 w-full rounded-full bg-primary/20" />
      )}
    </div>
  );
}

export default async function BillingPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const checkout = firstParam(params.checkout);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const tier = await resolveUserTier(supabase, user.id);
  const sub = await getSubscription(supabase, user.id);
  const ent = entitlementsFor(tier);
  const currentPlan = planFor(tier);

  const [accountsUsed, automationsUsed, scriptsUsed, transcriptsUsed] = await Promise.all([
    count(supabase, "inspiration_accounts", user.id),
    count(supabase, "reel_automations", user.id),
    monthlyUsed(supabase, user.id, "script"),
    monthlyUsed(supabase, user.id, "transcript"),
  ]);

  const hasSubscription = Boolean(sub?.stripeCustomerId);
  const renewLabel = sub?.currentPeriodEnd
    ? new Date(sub.currentPeriodEnd).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">Billing & plan</h1>
        <p className="text-sm text-muted-foreground">
          Manage your subscription and see how much of your plan you&apos;ve used this month.
        </p>
      </div>

      {checkout === "success" ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
          <CheckCircle2 className="h-4 w-4" /> Payment received — your plan is being activated. It
          may take a few seconds to appear.
        </div>
      ) : null}
      {checkout === "cancelled" ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          <XCircle className="h-4 w-4" /> Checkout cancelled — no changes were made.
        </div>
      ) : null}
      {!stripeConfigured() ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          Payments aren&apos;t live yet — plans are shown for preview. Check back soon.
        </div>
      ) : null}

      {/* Current plan + usage */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            {currentPlan.name} plan
            <Badge variant={isPaidTier(tier) ? "default" : "secondary"}>
              {isPaidTier(tier) ? "Active" : "Free"}
            </Badge>
          </CardTitle>
          <CardDescription>
            {hasSubscription && sub
              ? sub.cancelAtPeriodEnd && renewLabel
                ? `Cancels on ${renewLabel}.`
                : renewLabel
                  ? `Renews on ${renewLabel}.`
                  : `Status: ${sub.status}.`
              : "You're on the free plan. Upgrade any time to raise your limits."}
          </CardDescription>
          {hasSubscription ? (
            <div className="col-start-2 row-span-2 row-start-1 self-start justify-self-end">
              <ManageBillingButton />
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="grid gap-4 pt-4 sm:grid-cols-2">
          <UsageRow label="Tracked accounts" used={accountsUsed} limit={ent.accounts} />
          <UsageRow label="Scripts this month" used={scriptsUsed} limit={ent.scripts_mo} />
          <UsageRow label="Transcripts this month" used={transcriptsUsed} limit={ent.transcripts_mo} />
          <UsageRow label="Auto-replies" used={automationsUsed} limit={ent.automations} />
        </CardContent>
      </Card>

      {/* Plan grid */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {PLANS.map((plan) => {
          const isCurrent = plan.tier === tier;
          const planIndex = PLANS.findIndex((p) => p.tier === plan.tier);
          const currentIndex = PLANS.findIndex((p) => p.tier === tier);
          const isUpgrade = planIndex > currentIndex;
          return (
            <Card
              key={plan.tier}
              className={isCurrent ? "ring-2 ring-primary" : undefined}
            >
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  {plan.name}
                  {isCurrent ? <Badge variant="secondary">Current</Badge> : null}
                </CardTitle>
                <CardDescription>{plan.tagline}</CardDescription>
                <div className="pt-1 text-2xl font-semibold text-foreground">
                  {plan.priceAed === 0 ? "Free" : <>AED {plan.priceAed}<span className="text-sm font-normal text-muted-foreground">/mo</span></>}
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4">
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {plan.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      {h}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto">
                  {isPaidTier(plan.tier) && !isCurrent ? (
                    <SubscribeButton
                      tier={plan.tier as PaidTier}
                      label={isUpgrade ? "Upgrade" : "Switch plan"}
                      variant={isUpgrade ? "default" : "outline"}
                      disabled={!stripeConfigured()}
                    />
                  ) : isCurrent ? (
                    <p className="text-center text-xs text-muted-foreground">Your current plan</p>
                  ) : (
                    <p className="text-center text-xs text-muted-foreground">Included</p>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
