import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Check, CheckCircle2, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { resolveUserEntitlements } from "@/lib/billing/resolve";
import { getSubscription } from "@/lib/billing/subscription";
import { formatLimit, isUnlimited } from "@/lib/billing/entitlements";
import { PLANS, isPaidTier, type PaidTier } from "@/lib/billing/plans";
import { stripeConfigured } from "@/lib/billing/stripe";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SubscribeButton, ManageBillingButton } from "@/components/billing/BillingActions";
import { DynamicPlanCard } from "@/components/billing/DynamicPlanCard";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { intlLocale } from "@/lib/i18n/intl";
import { PageTourButton } from "@/components/tour/PageTourButton";

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

  const { locale } = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  const dict = getDictionary(locale);
  const t = dict.billing;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { tier, entitlements: ent } = await resolveUserEntitlements(supabase, user.id);
  const sub = await getSubscription(supabase, user.id);

  const [accountsUsed, automationsUsed, scriptsUsed, transcriptsUsed] = await Promise.all([
    count(supabase, "inspiration_accounts", user.id),
    count(supabase, "reel_automations", user.id),
    monthlyUsed(supabase, user.id, "script"),
    monthlyUsed(supabase, user.id, "transcript"),
  ]);

  const hasSubscription = Boolean(sub?.stripeCustomerId);
  const renewLabel = sub?.currentPeriodEnd
    ? new Date(sub.currentPeriodEnd).toLocaleDateString(intlLocale(locale), {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">{t.heading}</h1>
          <PageTourButton page="billing" />
        </div>
        <p className="text-sm text-muted-foreground">{t.subheading}</p>
      </div>

      {checkout === "success" ? (
        <div className="flex items-center gap-2 rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">
          <CheckCircle2 className="h-4 w-4" /> {t.checkoutSuccess}
        </div>
      ) : null}
      {checkout === "cancelled" ? (
        <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          <XCircle className="h-4 w-4" /> {t.checkoutCancelled}
        </div>
      ) : null}
      {!stripeConfigured() ? (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          {t.paymentsPreview}
        </div>
      ) : null}

      {/* Current plan + usage */}
      <Card data-tour="plan-usage">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            {t.planLabel(t.plans[tier as "free" | "creator" | "pro" | "studio" | "custom"].name)}
            <Badge variant={isPaidTier(tier) ? "default" : "secondary"}>
              {isPaidTier(tier) ? t.active : t.free}
            </Badge>
          </CardTitle>
          <CardDescription>
            {hasSubscription && sub
              ? sub.cancelAtPeriodEnd && renewLabel
                ? t.cancelsOn(renewLabel)
                : renewLabel
                  ? t.renewsOn(renewLabel)
                  : t.statusLabel(sub.status)
              : t.onFreePlan}
          </CardDescription>
          {hasSubscription ? (
            <div data-tour="manage-billing" className="col-start-2 row-span-2 row-start-1 self-start justify-self-end">
              <ManageBillingButton />
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="grid gap-4 pt-4 sm:grid-cols-2">
          <UsageRow label={t.usage.trackedAccounts} used={accountsUsed} limit={ent.accounts} />
          <UsageRow label={t.usage.scriptsThisMonth} used={scriptsUsed} limit={ent.scripts_mo} />
          <UsageRow
            label={t.usage.transcriptsThisMonth}
            used={transcriptsUsed}
            limit={ent.transcripts_mo}
          />
          <UsageRow label={t.usage.autoReplies} used={automationsUsed} limit={ent.automations} />
        </CardContent>
      </Card>

      {/* Plan grid */}
      <div data-tour="plan-comparison" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {PLANS.map((plan) => {
          const isCurrent = plan.tier === tier;
          const planIndex = PLANS.findIndex((p) => p.tier === plan.tier);
          const currentIndex = PLANS.findIndex((p) => p.tier === tier);
          const isUpgrade = planIndex > currentIndex;
          const planCopy = t.plans[plan.tier as "free" | "creator" | "pro" | "studio"];
          return (
            <Card
              key={plan.tier}
              className={isCurrent ? "ring-2 ring-primary" : undefined}
            >
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  {planCopy.name}
                  {isCurrent ? <Badge variant="secondary">{t.current}</Badge> : null}
                </CardTitle>
                <CardDescription>{planCopy.tagline}</CardDescription>
                <div className="pt-1 text-2xl font-semibold text-foreground">
                  {plan.priceAed === 0 ? (
                    t.free
                  ) : (
                    <>
                      AED {plan.priceAed}
                      <span className="text-sm font-normal text-muted-foreground">
                        {t.perMonthSuffix}
                      </span>
                    </>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4">
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {planCopy.highlights.map((h) => (
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
                      label={isUpgrade ? t.upgrade : t.switchPlan}
                      variant={isUpgrade ? "default" : "outline"}
                      disabled={!stripeConfigured()}
                    />
                  ) : isCurrent ? (
                    <p className="text-center text-xs text-muted-foreground">{t.yourCurrentPlan}</p>
                  ) : (
                    <p className="text-center text-xs text-muted-foreground">{t.included}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Dynamic "build your own plan" card (B4) */}
      <DynamicPlanCard disabled={!stripeConfigured()} />
    </div>
  );
}
