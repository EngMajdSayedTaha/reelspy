import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, Camera, ArrowRight, Sparkles, Users, Mic } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOnboardingState, SUGGESTED_ACCOUNTS } from "@/lib/onboarding/state";
import type { BrandVoice } from "@/lib/ai/claude";
import { Button } from "@/components/ui/button";
import { BrandVoiceForm } from "@/components/onboarding/BrandVoiceForm";
import {
  StarterPackButton,
  AddAccountsInline,
  SyncButton,
  FinishButton,
} from "@/components/onboarding/OnboardingControls";
import { saveBrandVoice } from "./actions";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const STEP_META = [
  { n: 1, label: "Connect", icon: Camera },
  { n: 2, label: "Brand voice", icon: Mic },
  { n: 3, label: "Add accounts", icon: Users },
  { n: 4, label: "First script", icon: Sparkles },
] as const;

function Stepper({ active, doneMap }: { active: number; doneMap: boolean[] }) {
  return (
    <ol className="flex items-center gap-2 sm:gap-3">
      {STEP_META.map((s, i) => {
        const done = doneMap[i];
        const isActive = s.n === active;
        return (
          <li key={s.n} className="flex flex-1 items-center gap-2">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium ring-1 ${
                done
                  ? "bg-primary/15 text-brand ring-primary/40"
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
            {i < STEP_META.length - 1 ? (
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
          <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">Let&apos;s get you set up</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Four quick steps to your first script — about ten minutes.
          </p>
        </div>
        <FinishButton href="/dashboard" label="Skip for now" variant="ghost" />
      </div>

      <Stepper active={active} doneMap={doneMap} />

      {active === 1 ? (
        <StepShell
          title="Connect Instagram"
          desc="ReelSpy pulls competitor reels through your Instagram Business account. It's the richest data source — but you can start with a ready-made starter pack and connect later."
        >
          {state.connected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
                <Check className="h-4 w-4" /> Instagram connected.
              </div>
              <ContinueLink to={2} />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild>
                  <a href="/api/ig/connect">
                    <Camera className="h-4 w-4" /> Connect Instagram
                  </a>
                </Button>
                <StarterPackButton />
              </div>
              <p className="text-xs text-muted-foreground">
                A starter pack seeds a few popular accounts from our shared cache — zero setup, no
                Instagram needed. {state.steps.source ? null : "Pick either to continue."}
              </p>
              {state.steps.source ? <ContinueLink to={2} /> : null}
            </div>
          )}
        </StepShell>
      ) : null}

      {active === 2 ? (
        <StepShell
          title="Your brand voice"
          desc="This is what makes generated scripts sound like you and not a generic template. Two lines is enough to start — you can refine it later in Settings."
        >
          <BrandVoiceForm
            action={saveBrandVoice}
            initial={(profile?.brand_voice as BrandVoice | null) ?? null}
            submitLabel="Save & continue"
            onSuccessHref="/dashboard/onboarding?step=3"
          />
          <div className="mt-4">
            <BackLink to={1} />
          </div>
        </StepShell>
      ) : null}

      {active === 3 ? (
        <StepShell
          title={`Add ${SUGGESTED_ACCOUNTS}–5 accounts to track`}
          desc="Pick creators in your niche whose reels you want to learn from. Add them by handle — they enrich automatically on the first sync."
        >
          <div className="space-y-4">
            <AddAccountsInline />
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">or</span>
              <StarterPackButton />
            </div>
            <p className="text-sm text-muted-foreground">
              Tracking <span className="font-medium text-foreground">{state.accountsCount}</span>{" "}
              account{state.accountsCount === 1 ? "" : "s"}
              {state.accountsCount < SUGGESTED_ACCOUNTS
                ? ` — a few more makes your feed richer.`
                : ` — nice, that's plenty to start.`}
            </p>
            <div className="flex items-center justify-between">
              <BackLink to={2} />
              {state.steps.accounts ? <ContinueLink to={4} /> : null}
            </div>
          </div>
        </StepShell>
      ) : null}

      {active === 4 ? (
        <StepShell
          title="Write your first script"
          desc="This is the payoff — turn a competitor's reel into an original script in your voice."
        >
          {state.activated ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
                <Check className="h-4 w-4" /> You wrote your first script. You&apos;re all set!
              </div>
              <FinishButton href="/dashboard" label="Go to dashboard" withIcon />
            </div>
          ) : topReelId ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                We picked your feed&apos;s top-performing reel to start from.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild>
                  <Link href={`/dashboard/generate/${topReelId}`}>
                    <Sparkles className="h-4 w-4" /> Write my first script <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <FinishButton href="/dashboard" label="I'll do this later" variant="ghost" />
              </div>
            </div>
          ) : state.connected ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Sync your feed to pull the latest reels from the accounts you track, then pick one to
                write from.
              </p>
              <div className="flex items-center gap-3">
                <SyncButton />
                <BackLink to={3} />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Connect Instagram to pull reels from the accounts you track — that&apos;s what powers
                script generation. You can also skip to the dashboard and explore first.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild>
                  <a href="/api/ig/connect">
                    <Camera className="h-4 w-4" /> Connect Instagram
                  </a>
                </Button>
                <FinishButton href="/dashboard" label="Skip to dashboard" variant="ghost" />
              </div>
            </div>
          )}
        </StepShell>
      ) : null}
    </div>
  );
}

function ContinueLink({ to }: { to: number }) {
  return (
    <Button asChild variant="default">
      <Link href={`/dashboard/onboarding?step=${to}`}>
        Continue <ArrowRight className="h-4 w-4" />
      </Link>
    </Button>
  );
}

function BackLink({ to }: { to: number }) {
  return (
    <Link
      href={`/dashboard/onboarding?step=${to}`}
      className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
    >
      Back
    </Link>
  );
}
