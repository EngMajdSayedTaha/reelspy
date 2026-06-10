import Link from "next/link";
import { redirect } from "next/navigation";
import {
  UserSearch,
  Clapperboard,
  ScrollText,
  Plug,
  ArrowRight,
  Sparkles,
  RefreshCw,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

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
      className="group rounded-2xl border border-[#1f1f1f] bg-[#111111] p-5 transition-colors hover:border-[#2e2e2e]"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-400">{label}</p>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1a1a1a] text-zinc-400 transition group-hover:bg-[#F9E400]/10 group-hover:text-[#F9E400]">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
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

  // ig_user_id is set/cleared together with the token, so it's a safe
  // "connected" signal without granting the page access to the token itself.
  const { data: profile } = await supabase
    .from("profiles")
    .select("username, ig_user_id")
    .eq("id", user.id)
    .maybeSingle();

  const [accountsCountResult, reelsCountResult, scriptsCountResult] = await Promise.all([
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
  ]);

  const accountsCount = accountsCountResult.count ?? 0;
  const reelsCount = reelsCountResult.count ?? 0;
  const scriptsCount = scriptsCountResult.count ?? 0;
  const igConnected = Boolean(profile?.ig_user_id);
  const username = profile?.username ?? user.email ?? "creator";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          Welcome back, {username}
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Your content intelligence command center.
        </p>
      </div>

      {!igConnected ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
            <div>
              <p className="text-sm font-medium text-amber-200">Instagram not connected</p>
              <p className="text-xs text-amber-200/70">
                Connect your account to sync inspiration reels and analytics.
              </p>
            </div>
          </div>
          <Button asChild variant="outline">
            <Link href="/dashboard/settings/instagram">
              <Plug className="h-4 w-4" />
              Connect
            </Link>
          </Button>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
          label="Instagram"
          value={igConnected ? "Connected" : "Offline"}
          icon={Plug}
          href="/dashboard/settings/instagram"
        />
      </div>

      <div className="rounded-2xl border border-[#1f1f1f] bg-[#111111] p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
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
      className="group flex items-center gap-3 rounded-xl border border-[#1f1f1f] bg-[#141414] p-4 transition-colors hover:border-[#F9E400]/40"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1a1a1a] text-zinc-300 transition group-hover:bg-[#F9E400]/10 group-hover:text-[#F9E400]">
        <Icon className="h-5 w-5" />
      </span>
      <div className="flex-1">
        <p className="text-sm font-medium text-zinc-100">{title}</p>
        <p className="text-xs text-zinc-500">{desc}</p>
      </div>
      <ArrowRight className="h-4 w-4 text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-[#F9E400]" />
    </Link>
  );
}
