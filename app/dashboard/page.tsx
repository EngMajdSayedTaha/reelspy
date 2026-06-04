import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type StatCardProps = {
  label: string;
  value: string;
};

function StatCard({ label, value }: StatCardProps) {
  return (
    <article className="rounded-xl border border-[#1f1f1f] bg-[#111111] p-5">
      <p className="text-sm text-zinc-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
    </article>
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, ig_access_token")
    .eq("id", user.id)
    .maybeSingle();

  const accountCountPromise = supabase
    .from("inspiration_accounts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  const reelsCountPromise = supabase
    .from("tracked_reels")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  const scriptsCountPromise = supabase
    .from("generated_scripts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  const [accountsCountResult, reelsCountResult, scriptsCountResult] = await Promise.all([
    accountCountPromise,
    reelsCountPromise,
    scriptsCountPromise,
  ]);

  const accountsCount = accountsCountResult.count ?? 0;
  const reelsCount = reelsCountResult.count ?? 0;
  const scriptsCount = scriptsCountResult.count ?? 0;
  const igConnected = Boolean(profile?.ig_access_token);
  const username = profile?.username ?? user.email ?? "creator";

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold text-white">Welcome back, {username}</h1>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Inspiration Accounts" value={String(accountsCount)} />
        <StatCard label="Total Tracked Reels" value={String(reelsCount)} />
        <StatCard label="Scripts Generated" value={String(scriptsCount)} />
        <StatCard label="IG Connected" value={igConnected ? "Yes" : "No"} />
      </div>
    </div>
  );
}
