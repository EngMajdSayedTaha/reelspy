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

type StatCardProps = {
  label: string;
  value: string;
  icon: LucideIcon;
  href: string;
};

function StatCard({ label, value, icon: Icon, href }: StatCardProps) {
  return (
    <Link
      href={href}
      className="group sheen rounded-2xl border border-border bg-card p-4 transition duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-lg hover:shadow-black/40 sm:p-5"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground transition group-hover:bg-primary/10 group-hover:text-brand">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold text-foreground sm:text-3xl">{value}</p>
    </Link>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // First-run routing (L7/B3): send brand-new users straight into the wizard;
  // users who've started but not activated get the checklist card below.
  const onboarding = await getOnboardingState(supabase, user.id);
  if (!onboarding.complete && onboarding.completedCount === 0) {
    redirect("/dashboard/onboarding");
  }
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
  const username = profile?.username ?? user.email ?? "creator";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Welcome back, {username}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your content intelligence command center.
        </p>
      </div>

      {showChecklist ? <SetupChecklist state={onboarding} /> : null}

      <div className="stagger grid grid-cols-1 gap-3 min-[440px]:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Inspiration Accounts"
          value={String(accountsCount)}
          icon={UserSearch}
          href="/dashboard/accounts"
        />
        <StatCard
          label="Tracked Reels"
          value={String(reelsCount)}
          icon={Clapperboard}
          href="/dashboard/feed"
        />
        <StatCard
          label="Scripts Generated"
          value={String(scriptsCount)}
          icon={ScrollText}
          href="/dashboard/scripts"
        />
        <StatCard
          label="Posts Published"
          value={String(publishedCount)}
          icon={Send}
          href="/dashboard/publishing"
        />
        <StatCard
          label="Reels Worked On"
          value={String(workedCount)}
          icon={CheckCircle2}
          href="/dashboard/feed?status=worked"
        />
        <StatCard
          label="Favorites"
          value={String(favoritesCount)}
          icon={Heart}
          href="/dashboard/feed?status=favorites"
        />
        <StatCard
          label="Scheduled Scripts"
          value={String(scheduledCount)}
          icon={CalendarCheck}
          href="/dashboard/calendar"
        />
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Quick actions
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <QuickAction
            href="/dashboard/accounts"
            icon={UserSearch}
            title="Add accounts"
            desc="Track new creators"
          />
          <QuickAction
            href="/dashboard/feed"
            icon={RefreshCw}
            title="Sync feed"
            desc="Pull the latest reels"
          />
          <QuickAction
            href="/dashboard/scripts"
            icon={Sparkles}
            title="Write a script"
            desc="Turn ideas into content"
          />
        </div>
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
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-muted-foreground transition group-hover:bg-primary/10 group-hover:text-brand">
        <Icon className="h-5 w-5" />
      </span>
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-subtle">{desc}</p>
      </div>
      <ArrowRight className="h-4 w-4 text-subtle transition group-hover:translate-x-0.5 group-hover:text-brand" />
    </Link>
  );
}
