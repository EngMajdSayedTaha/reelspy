import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { CalendarClock, Check, CheckCircle2, Info, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSubscription, getPendingPlanChange } from "@/lib/billing/subscription";
import { syncSubscriptionForUser } from "@/lib/billing/sync";
import { getStripe } from "@/lib/billing/stripe";
import { formatLimit, isUnlimited, ENTITLEMENTS } from "@/lib/billing/entitlements";
import type { AiTier } from "@/lib/ai/tier";
import { isPaidTier, type PaidTier } from "@/lib/billing/plans";
import { loadCatalog, entitlementsForSlug, planCopyFor, currentPrice } from "@/lib/billing/catalog";
import { planChangeDirection } from "@/lib/billing/format";
import { stripeConfigured } from "@/lib/billing/stripe";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  SubscribeButton,
  ManageBillingButton,
  KeepCurrentPlanButton,
  CancelSubscriptionButton,
  ResumeSubscriptionButton,
} from "@/components/billing/BillingActions";
import { DynamicPlanCard } from "@/components/billing/DynamicPlanCard";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { intlLocale } from "@/lib/i18n/intl";
import { PageTourButton } from "@/components/tour/PageTourButton";
import { isAdminUser } from "@/lib/billing/admin";

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

  // Returning from Checkout: pull the subscription straight from Stripe and sync
  // it before we render, so the new plan is visible on this very page load. The
  // webhook is still the durable source of truth (and re-syncs the same row
  // idempotently) — this just removes the "wait a few seconds and refresh" gap,
  // and keeps checkout usable on a local machine Stripe can't reach.
  if (checkout === "success") {
    const stripe = getStripe();
    if (stripe) {
      try {
        await syncSubscriptionForUser(createAdminClient(), stripe, user.id);
      } catch (err) {
        // Never block the page on reconciliation — the webhook will catch up.
        console.error("[billing] checkout reconcile failed:", err instanceof Error ? err.message : err);
      }
    }
  }

  const sub = await getSubscription(supabase, user.id);
  // The billing page reflects the ACTUAL Stripe subscription, not any admin tier
  // elevation (resolveUserTier gives admins "studio"). So an admin with no sub
  // sees "Free" here and can test the real checkout/switch flow, and a real
  // subscriber sees exactly the plan they pay for.
  const billingTier: AiTier = sub && sub.active ? sub.tier : "free";
  // Plans, their limits, their prices and their copy all come from the
  // admin-managed catalog now (falling back to the built-in constants when it
  // has nothing to say), so changing any of them is a settings edit, not a deploy.
  const catalog = await loadCatalog();
  const ent =
    billingTier === "custom"
      ? sub?.customEntitlements ?? ENTITLEMENTS.custom
      : entitlementsForSlug(catalog, billingTier);

  const [accountsUsed, automationsUsed, scriptsUsed, transcriptsUsed] = await Promise.all([
    count(supabase, "inspiration_accounts", user.id),
    count(supabase, "reel_automations", user.id),
    monthlyUsed(supabase, user.id, "script"),
    monthlyUsed(supabase, user.id, "transcript"),
  ]);

  const hasSubscription = Boolean(sub?.stripeCustomerId);
  const dateLabel = (value: string | null | undefined) =>
    value
      ? new Date(value).toLocaleDateString(intlLocale(locale), {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : null;
  const renewLabel = dateLabel(sub?.currentPeriodEnd);

  // A plan change the user has already scheduled for their next renewal. It is
  // deliberately NOT applied to `billingTier`/`ent` above: until Stripe advances
  // the schedule, the customer is on — and entitled to — the plan they paid for.
  const pending = sub?.active ? await getPendingPlanChange(supabase, user.id) : null;
  const pendingPlanName = pending
    ? planCopyFor(catalog, pending.tier, locale).name
    : null;
  const pendingEffectiveLabel = dateLabel(pending?.effectiveAt) ?? renewLabel;
  const currentPlanName = planCopyFor(catalog, billingTier, locale).name;
  // The comparison grid shows every published plan EXCEPT the build-your-own
  // one, which has its own slider card below rather than a fixed price.
  // "Preview as customer" from the plan editor: an admin can see a DRAFT plan in
  // the real grid before publishing it. Gated on isAdminUser, and deliberately
  // display-only — checkout still refuses an unpublished plan, so previewing one
  // can never turn into buying one.
  const previewSlug = firstParam(params.preview_plan);
  const previewPlan =
    previewSlug && (await isAdminUser(supabase, user.id).catch(() => false))
      ? catalog.bySlug.get(previewSlug) ?? null
      : null;

  const gridPlans = [
    ...catalog.plans.filter((p) => p.kind !== "custom"),
    ...(previewPlan && previewPlan.status !== "published" && previewPlan.kind !== "custom"
      ? [previewPlan]
      : []),
  ].sort((a, b) => a.sortOrder - b.sortOrder);
  const ladder = catalog.ladder as AiTier[];
  const currentCatalogPrice = currentPrice(catalog, billingTier);
  const currentPriceLabel =
    billingTier === "custom"
      ? ""
      : currentCatalogPrice
        ? `AED ${Math.round(currentCatalogPrice.unitAmount / 100)}`
        : "";
  // Every in-app plan action needs a live Stripe subscription to schedule against.
  const canManagePlan = Boolean(sub?.active && sub.stripeSubscriptionId);

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
            {t.planLabel(currentPlanName)}
            <Badge variant={isPaidTier(billingTier) ? "default" : "secondary"}>
              {isPaidTier(billingTier) ? t.active : t.free}
            </Badge>
          </CardTitle>
          <CardDescription>
            {sub?.active
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

        {/* A scheduled plan change: what's coming, when, and the way out of it. */}
        {pending && pendingPlanName ? (
          <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-warning/5 px-6 py-4">
            <div className="space-y-1">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                <CalendarClock className="h-4 w-4 shrink-0 text-warning" />
                {t.scheduledChange.title(pendingPlanName)}
              </p>
              <p className="text-sm text-muted-foreground">
                {pendingEffectiveLabel
                  ? t.scheduledChange.body(currentPlanName, pendingPlanName, pendingEffectiveLabel)
                  : t.scheduledChange.bodyNoDate(currentPlanName, pendingPlanName)}
                {pending.priceAed && pendingEffectiveLabel
                  ? ` ${t.scheduledChange.priceFrom(`AED ${pending.priceAed}`, pendingEffectiveLabel)}`
                  : null}
              </p>
            </div>
            {canManagePlan ? (
              <KeepCurrentPlanButton
                currentPlanName={currentPlanName}
                pendingPlanName={pendingPlanName}
                effectiveOnLabel={pendingEffectiveLabel}
              />
            ) : null}
          </div>
        ) : null}

        {/* A scheduled cancellation: access continues, and it can be undone. */}
        {sub?.active && sub.cancelAtPeriodEnd ? (
          <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-destructive/5 px-6 py-4">
            <div className="space-y-1">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                <CalendarClock className="h-4 w-4 shrink-0 text-destructive" />
                {renewLabel ? t.cancelPlan.pendingTitle(renewLabel) : t.cancelPlan.action}
              </p>
              <p className="text-sm text-muted-foreground">
                {renewLabel
                  ? t.cancelPlan.pendingBody(currentPlanName, renewLabel)
                  : t.cancelPlan.bodyNoDate(currentPlanName)}
              </p>
            </div>
            {canManagePlan ? (
              <ResumeSubscriptionButton
                planName={currentPlanName}
                renewsOnLabel={renewLabel}
                priceLabel={currentPriceLabel}
              />
            ) : null}
          </div>
        ) : null}

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

      {/* The end-of-period rule, stated permanently — not only inside the
          confirmation dialogs — so it's never a surprise. */}
      <div className="flex items-start gap-3 rounded-lg border border-border bg-surface-2 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-foreground">{t.policy.title}</p>
          <p className="text-sm text-muted-foreground">{t.policy.body}</p>
        </div>
      </div>

      {previewPlan && previewPlan.status !== "published" ? (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          Admin preview: <strong>{planCopyFor(catalog, previewPlan.slug, locale).name}</strong> is a{" "}
          {previewPlan.status} plan. Only you can see it, and checkout will refuse it until it&apos;s
          published.
        </div>
      ) : null}

      {/* Plan grid */}
      <div data-tour="plan-comparison" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {gridPlans.map((plan) => {
          const isCurrent = plan.slug === billingTier;
          const isPendingPlan = pending?.tier === plan.slug;
          const isUpgrade = ladder.indexOf(plan.slug) > ladder.indexOf(billingTier);
          const planCopy = planCopyFor(catalog, plan.slug, locale);
          const price = currentPrice(catalog, plan.slug);
          const priceMajor = price ? Math.round(price.unitAmount / 100) : 0;
          return (
            <Card
              key={plan.slug}
              className={
                isCurrent ? "ring-2 ring-primary" : isPendingPlan ? "ring-2 ring-warning/60" : undefined
              }
            >
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  {planCopy.name}
                  {isCurrent ? (
                    <Badge variant="secondary">{t.current}</Badge>
                  ) : isPendingPlan ? (
                    <Badge variant="outline">{t.scheduledBadge}</Badge>
                  ) : null}
                </CardTitle>
                <CardDescription>{planCopy.tagline}</CardDescription>
                <div className="pt-1 text-2xl font-semibold text-foreground">
                  {priceMajor === 0 ? (
                    t.free
                  ) : (
                    <>
                      AED {priceMajor}
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
                  {isPendingPlan && pendingEffectiveLabel ? (
                    <p className="text-center text-xs text-muted-foreground">
                      {t.scheduledChange.title(planCopy.name)} · {pendingEffectiveLabel}
                    </p>
                  ) : isPaidTier(plan.slug) && !isCurrent ? (
                    <SubscribeButton
                      tier={plan.slug as PaidTier}
                      label={isUpgrade ? t.upgrade : t.switchPlan}
                      variant={isUpgrade ? "default" : "outline"}
                      disabled={!stripeConfigured()}
                      planName={planCopy.name}
                      priceLabel={priceMajor ? `AED ${priceMajor}` : ""}
                      currentPlanName={currentPlanName}
                      effectiveOnLabel={renewLabel}
                      direction={planChangeDirection(billingTier, plan.slug, ladder)}
                      hasSubscription={canManagePlan}
                    />
                  ) : isCurrent ? (
                    <p className="text-center text-xs text-muted-foreground">{t.yourCurrentPlan}</p>
                  ) : plan.slug === "free" && canManagePlan && !sub?.cancelAtPeriodEnd ? (
                    // Downgrading to Free means ending the subscription — same
                    // end-of-period promise, so it lives on the Free card.
                    <CancelSubscriptionButton
                      planName={currentPlanName}
                      accessUntilLabel={renewLabel}
                      className="w-full"
                    />
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
      <DynamicPlanCard
        disabled={!stripeConfigured()}
        hasSubscription={canManagePlan}
        currentPlanName={currentPlanName}
        effectiveOnLabel={renewLabel}
      />
    </div>
  );
}
