import Link from "next/link";
import { redirect } from "next/navigation";
import { AtSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GrowthNotes } from "@/components/instagram/GrowthNotes";
import { MyReelsInsights } from "@/components/instagram/MyReelsInsights";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getIgCredentials } from "@/lib/instagram/token-store";
import { getMyInsights } from "@/lib/instagram/graph-api";
import { readMyInsightsCache, type MyInsightsProfile } from "@/lib/instagram/my-insights";

function formatNumber(n: number | null | undefined) {
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default async function MyAccountPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();

  // Token reads go through the admin client; browser-facing roles can only see
  // connection metadata, never the token column.
  const admin = createAdminClient();
  const credentials = await getIgCredentials(admin, user.id).catch(() => null);
  const connected = Boolean(credentials);

  let insights: MyInsightsProfile | null = null;
  let igError: string | null = null;

  if (credentials) {
    // The header reads from the same per-user cache as the insights section, so
    // page renders don't block on a Graph call once a first sync has happened.
    const cached = await readMyInsightsCache(admin, user.id).catch(() => null);
    if (cached) {
      insights = cached.payload.profile;
    } else {
      try {
        insights = await getMyInsights(credentials.igUserId, credentials.token);
      } catch {
        igError =
          "Could not load Instagram insights. Your token may have expired — reconnect in Settings.";
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-semibold text-foreground">My IG</h1>
        <p className="text-sm text-muted-foreground">
          Your Instagram account — full reel history, performance and insights.
        </p>
      </div>

      {igError ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-400">
          {igError}
        </div>
      ) : null}

      {/* Account Overview */}
      <section className="rounded-xl border border-border bg-card p-5 text-foreground">
        <div className="flex flex-wrap items-center gap-4">
          {insights?.profile_picture_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={insights.profile_picture_url}
              alt={`@${insights.username}`}
              referrerPolicy="no-referrer"
              className="h-16 w-16 rounded-full object-cover ring-2 ring-primary/40"
            />
          ) : (
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary ring-1 ring-border-strong">
              <AtSign className="h-7 w-7 text-subtle" />
            </span>
          )}

          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold text-foreground">
              {insights?.username
                ? `@${insights.username}`
                : profile?.username ?? user.email ?? "—"}
            </p>
            <p className={`text-sm ${connected ? "text-emerald-400" : "text-rose-400"}`}>
              {connected ? "Connected" : "Not connected"}
            </p>
            {insights?.biography ? (
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{insights.biography}</p>
            ) : null}
          </div>

          <div className="flex gap-6 text-center">
            <div>
              <p className="text-2xl font-semibold text-foreground">
                {insights ? formatNumber(insights.followers_count) : "—"}
              </p>
              <p className="text-xs text-subtle">Followers</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-foreground">
                {insights ? formatNumber(insights.media_count) : "—"}
              </p>
              <p className="text-xs text-subtle">Posts</p>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/settings/instagram">Manage Connection</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/feed">Go to Feed</Link>
          </Button>
        </div>
      </section>

      {/* Own reels + full insights (separate sync, doesn't touch the shared budget) */}
      <MyReelsInsights connected={connected} />

      {/* AI growth notes from your recent posts */}
      <GrowthNotes connected={connected} />

      {!connected ? (
        <div className="rounded-xl border border-dashed border-border-strong p-5 text-sm text-muted-foreground">
          Connect your Instagram account in{" "}
          <Link href="/dashboard/settings/instagram" className="text-brand hover:underline">
            Settings
          </Link>{" "}
          to see analytics here.
        </div>
      ) : null}
    </div>
  );
}
