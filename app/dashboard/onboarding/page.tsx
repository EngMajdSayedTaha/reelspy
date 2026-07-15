import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Check, Camera, ArrowRight, Sparkles, Users, Mic } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOnboardingState, suggestedAccountsFor } from "@/lib/onboarding/state";
import type { BrandVoice } from "@/lib/ai/claude";
import { Button } from "@/components/ui/button";
import { BrandVoiceForm } from "@/components/onboarding/BrandVoiceForm";
import {
  StarterPackButton,
  AddAccountsInline,
  SyncButton,
  FinishButton,
} from "@/components/onboarding/OnboardingControls";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { getDictionary, type Dict } from "@/lib/i18n/dictionaries";
import { saveBrandVoice } from "./actions";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function stepMeta(dict: Dict["onboarding"]) {
  return [
    { n: 1, label: dict.stepConnect, icon: Camera },
    { n: 2, label: dict.stepBrandVoice, icon: Mic },
    { n: 3, label: dict.stepAddAccounts, icon: Users },
    { n: 4, label: dict.stepFirstScript, icon: Sparkles },
  ] as const;
}

function Stepper({
  active,
  doneMap,
  stepMeta: steps,
}: {
  active: number;
  doneMap: boolean[];
  stepMeta: ReturnType<typeof stepMeta>;
}) {
  return (
    <ol className="flex items-center gap-2 sm:gap-3">
      {steps.map((s, i) => {
        const done = doneMap[i];
        const isActive = s.n === active;
        return (
          <li key={s.n} className="flex flex-1 items-center gap-2">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium ring-1 ${
                done
                  ? "bg-accent-brand/15 text-accent-brand ring-accent-brand/40"
                  : isActive
                    ? "bg-primary text-primary-foreground ring-primary"
                    : "bg-secondary text-muted-foreground ring-border"
              }`}
            >
              {done ? <Check className="h-4 w-4" /> : s.n}
            </div>
            <span
              className={`hidden text-sm sm:block ${isActive ? "font-medium text-foreground" : "text-muted-foreground"}`}
            >
              {s.label}
            </span>
            {i < steps.length - 1 ? (
              <span className="mx-1 hidden h-px flex-1 bg-border sm:block" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function StepShell({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
      <div className="mt-5">{children}</div>
    </div>
  );
}

export default async function OnboardingPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const { locale } = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  const fullDict = getDictionary(locale);
  const dict = fullDict.onboarding;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const state = await getOnboardingState(supabase, user.id);

  // Already finished/dismissed → nothing to do here.
  if (state.complete) redirect("/dashboard");

  // Drive the visible step from the URL so data mutations (which refresh in
  // place) don't yank the user forward; default to the first unfinished step.
  const rawStep = Array.isArray(params.step) ? params.step[0] : params.step;
  const parsed = rawStep ? Number(rawStep) : NaN;
  if (!rawStep || !Number.isInteger(parsed) || parsed < 1 || parsed > 4) {
    redirect(`/dashboard/onboarding?step=${state.currentStep}`);
  }
  const active = parsed as 1 | 2 | 3 | 4;

  const { data: profile } = await supabase
    .from("profiles")
    .select("brand_voice")
    .eq("id", user.id)
    .maybeSingle();

  // For step 4, the highest-velocity reel to write the first script from.
  let topReelId: string | null = null;
  if (state.reelsCount > 0) {
    const { data: reel } = await supabase
      .from("tracked_reels")
      .select("id")
      .eq("user_id", user.id)
      .order("viral_score", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    topReelId = reel?.id ?? null;
  }

  const doneMap = [state.steps.source, state.steps.brandVoice, state.steps.accounts, state.steps.firstScript];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">{dict.pageTitle}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {dict.pageSubtitle}
          </p>
        </div>
        <FinishButton href="/dashboard" label={dict.skipForNow} variant="ghost" />
      </div>

      <Stepper active={active} doneMap={doneMap} stepMeta={stepMeta(dict)} />

      {active === 1 ? (
        <StepShell
          title={dict.step1Title}
          desc={dict.step1Desc}
        >
          {state.connected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">
                <Check className="h-4 w-4" /> {dict.instagramConnected}
              </div>
              <ContinueLink to={2} dict={dict} />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild>
                  <a href="/api/ig/connect">
                    <Camera className="h-4 w-4" /> {dict.connectInstagram}
                  </a>
                </Button>
                {/* Hide once the plan's account cap is already used (e.g. via
                    a prior starter-pack add) — clicking again can only fail. */}
                {state.accountsAtCap ? null : <StarterPackButton />}
              </div>
              {state.accountsAtCap ? (
                <p className="text-xs text-muted-foreground">
                  {fullDict.accounts.actions.accountLimit(fullDict.billing.plans[state.tier].name, state.accountsCap)}{" "}
                  <Link href="/dashboard/billing" className="underline underline-offset-4 hover:text-foreground">
                    {fullDict.billing.upgrade}
                  </Link>
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {dict.starterPackHint} {state.steps.source ? null : dict.pickEitherToContinue}
                </p>
              )}
              {state.steps.source ? <ContinueLink to={2} dict={dict} /> : null}
            </div>
          )}
        </StepShell>
      ) : null}

      {active === 2 ? (
        <StepShell
          title={dict.step2Title}
          desc={dict.step2Desc}
        >
          <BrandVoiceForm
            action={saveBrandVoice}
            initial={(profile?.brand_voice as BrandVoice | null) ?? null}
            submitLabel={dict.saveAndContinue}
            onSuccessHref="/dashboard/onboarding?step=3"
          />
          <div className="mt-4">
            <BackLink to={1} dict={dict} />
          </div>
        </StepShell>
      ) : null}

      {active === 3 ? (
        <StepShell
          title={dict.step3Title(state.accountsCap)}
          desc={dict.step3Desc}
        >
          <div className="space-y-4">
            {state.accountsAtCap ? (
              <p className="text-sm text-muted-foreground">
                {fullDict.accounts.actions.accountLimit(fullDict.billing.plans[state.tier].name, state.accountsCap)}{" "}
                <Link href="/dashboard/billing" className="underline underline-offset-4 hover:text-foreground">
                  {fullDict.billing.upgrade}
                </Link>
              </p>
            ) : (
              <>
                <AddAccountsInline />
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">{dict.or}</span>
                  <StarterPackButton />
                </div>
              </>
            )}
            <p className="text-sm text-muted-foreground">
              {dict.trackingAccounts(
                state.accountsCount,
                state.accountsAtCap || state.accountsCount >= suggestedAccountsFor(state.accountsCap)
              )}
            </p>
            <div className="flex items-center justify-between">
              <BackLink to={2} dict={dict} />
              {state.steps.accounts ? <ContinueLink to={4} dict={dict} /> : null}
            </div>
          </div>
        </StepShell>
      ) : null}

      {active === 4 ? (
        <StepShell
          title={dict.step4Title}
          desc={dict.step4Desc}
        >
          {state.activated ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">
                <Check className="h-4 w-4" /> {dict.firstScriptDone}
              </div>
              <FinishButton href="/dashboard" label={dict.goToDashboard} withIcon />
            </div>
          ) : topReelId ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {dict.topReelPicked}
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild>
                  <Link href={`/dashboard/generate/${topReelId}`}>
                    <Sparkles className="h-4 w-4" /> {dict.writeFirstScript} <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                  </Link>
                </Button>
                <FinishButton href="/dashboard" label={dict.illDoThisLater} variant="ghost" />
              </div>
            </div>
          ) : state.connected ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {dict.syncFeedPrompt}
              </p>
              <div className="flex items-center gap-3">
                <SyncButton />
                <BackLink to={3} dict={dict} />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {dict.connectToPullReels}
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild>
                  <a href="/api/ig/connect">
                    <Camera className="h-4 w-4" /> {dict.connectInstagram}
                  </a>
                </Button>
                <FinishButton href="/dashboard" label={dict.skipToDashboard} variant="ghost" />
              </div>
            </div>
          )}
        </StepShell>
      ) : null}
    </div>
  );
}

function ContinueLink({ to, dict }: { to: number; dict: Dict["onboarding"] }) {
  return (
    <Button asChild variant="default">
      <Link href={`/dashboard/onboarding?step=${to}`}>
        {dict.continueLabel} <ArrowRight className="h-4 w-4 rtl:rotate-180" />
      </Link>
    </Button>
  );
}

function BackLink({ to, dict }: { to: number; dict: Dict["onboarding"] }) {
  return (
    <Link
      href={`/dashboard/onboarding?step=${to}`}
      className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
    >
      {dict.back}
    </Link>
  );
}
