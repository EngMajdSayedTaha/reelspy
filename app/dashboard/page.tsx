import { Suspense } from "react";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  UserSearch,
  Clapperboard,
  ScrollText,
  ArrowRight,
  Sparkles,
  RefreshCw,
  CalendarCheck,
  CheckCircle2,
  Heart,
  Send,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOnboardingState } from "@/lib/onboarding/state";
import { SetupChecklist } from "@/components/onboarding/SetupChecklist";
import { SuggestedAccountsSection } from "@/components/suggestions/SuggestedAccountsSection";
import { SuggestionsSkeleton } from "@/components/suggestions/SuggestionsSkeleton";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { PageTourButton } from "@/components/tour/PageTourButton";

type StatCardProps = {
  label: string;
  value: string;
  icon: LucideIcon;
  href: string;
  /** Shown instead of a bare "0" once the setup checklist is no longer
   *  around to nudge the user — a muted dash + a one-line next step. */
  emptyHint?: string;
};

function StatCard({ label, value, icon: Icon, href, emptyHint }: StatCardProps) {
  const isEmpty = emptyHint && value === "0";
  return (
    <Link
      href={href}
      className="group sheen rounded-2xl border border-border bg-card p-4 transition duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-lg hover:shadow-black/40 sm:p-5"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground transition group-hover:bg-accent-brand/10 group-hover:text-accent-brand">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      {isEmpty ? (
        <>
          <p className="mt-3 text-2xl font-semibold text-muted-foreground sm:text-3xl">—</p>
          <p className="mt-1 text-xs text-subtle">{emptyHint}</p>
        </>
      ) : (
        <p className="mt-3 text-2xl font-semibold text-foreground sm:text-3xl">{value}</p>
      )}
    </Link>
  );
}

export default async function DashboardPage() {
  const { locale } = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  const dict = getDictionary(locale);
  const t = dict.dashboard;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // First-run routing (L7/B3): brand-new users see the onboarding quiz popup
  // instead (mounted in DashboardShell) — the full wizard stays reachable via
  // the checklist card below for anyone not yet activated.
  const onboarding = await getOnboardingState(supabase, user.id);
  const showChecklist = !onboarding.complete && !onboarding.activated;

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();

  const [
    accountsCountResult,
    reelsCountResult,
    scriptsCountResult,
    workedCountResult,
    favoritesCountResult,
    scheduledCountResult,
    publishedCountResult,
  ] = await Promise.all([
    supabase
      .from("inspiration_accounts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("tracked_reels")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("generated_scripts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("tracked_reels")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_worked_on", true),
    supabase
      .from("tracked_reels")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_favorite", true),
    supabase
      .from("generated_scripts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .not("scheduled_date", "is", null),
    supabase
      .from("publish_posts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "done"),
  ]);

  const accountsCount = accountsCountResult.count ?? 0;
  const reelsCount = reelsCountResult.count ?? 0;
  const scriptsCount = scriptsCountResult.count ?? 0;
  const workedCount = workedCountResult.count ?? 0;
  const favoritesCount = favoritesCountResult.count ?? 0;
  const scheduledCount = scheduledCountResult.count ?? 0;
  const publishedCount = publishedCountResult.count ?? 0;
  const username = profile?.username ?? user.email ?? t.fallbackName;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {t.welcomeBack(username)}
          </h1>
          <PageTourButton page="dashboard" />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{t.subheading}</p>
      </div>

      {showChecklist ? <SetupChecklist state={onboarding} /> : null}

      <div
        data-tour="dashboard-stats"
        className="stagger grid grid-cols-1 gap-3 min-[440px]:grid-cols-2 sm:gap-4 xl:grid-cols-4"
      >
        <StatCard
          label={t.stats.inspirationAccounts}
          value={String(accountsCount)}
          icon={UserSearch}
          href="/dashboard/accounts"
          emptyHint={showChecklist ? undefined : t.emptyHints.accounts}
        />
        <StatCard
          label={t.stats.trackedReels}
          value={String(reelsCount)}
          icon={Clapperboard}
          href="/dashboard/feed"
          emptyHint={showChecklist ? undefined : t.emptyHints.reels}
        />
        <StatCard
          label={t.stats.scriptsGenerated}
          value={String(scriptsCount)}
          icon={ScrollText}
          href="/dashboard/scripts"
          emptyHint={showChecklist ? undefined : t.emptyHints.scripts}
        />
        <StatCard
          label={t.stats.postsPublished}
          value={String(publishedCount)}
          icon={Send}
          href="/dashboard/publishing"
          emptyHint={showChecklist ? undefined : t.emptyHints.published}
        />
        <StatCard
          label={t.stats.reelsWorkedOn}
          value={String(workedCount)}
          icon={CheckCircle2}
          href="/dashboard/feed?status=worked"
        />
        <StatCard
          label={t.stats.favorites}
          value={String(favoritesCount)}
          icon={Heart}
          href="/dashboard/feed?status=favorites"
        />
        <StatCard
          label={t.stats.scheduledScripts}
          value={String(scheduledCount)}
          icon={CalendarCheck}
          href="/dashboard/calendar"
        />
      </div>

      <div data-tour="quick-actions" className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t.quickActions.heading}
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <QuickAction
            href="/dashboard/accounts"
            icon={UserSearch}
            title={t.quickActions.addAccounts.title}
            desc={t.quickActions.addAccounts.desc}
          />
          <QuickAction
            href="/dashboard/feed"
            icon={RefreshCw}
            title={t.quickActions.syncFeed.title}
            desc={t.quickActions.syncFeed.desc}
          />
          <QuickAction
            href="/dashboard/scripts"
            icon={Sparkles}
            title={t.quickActions.writeScript.title}
            desc={t.quickActions.writeScript.desc}
          />
        </div>
      </div>

      <div data-tour="suggested-accounts">
        <Suspense fallback={<SuggestionsSkeleton rows={3} />}>
          <SuggestedAccountsSection userId={user.id} variant="widget" limit={3} />
        </Suspense>
      </div>
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  title,
  desc,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-border bg-surface-2 p-4 transition duration-200 hover:-translate-y-0.5 hover:border-primary/40"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-muted-foreground transition group-hover:bg-accent-brand/10 group-hover:text-accent-brand">
        <Icon className="h-5 w-5" />
      </span>
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-subtle">{desc}</p>
      </div>
      <ArrowRight className="h-4 w-4 text-subtle transition rtl:rotate-180 group-hover:translate-x-0.5 group-hover:text-accent-brand rtl:group-hover:-translate-x-0.5" />
    </Link>
  );
}
