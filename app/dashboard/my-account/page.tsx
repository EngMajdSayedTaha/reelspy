import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { getMyInsights, getMyRecentMedia } from "@/lib/instagram/graph-api";

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

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("username, ig_user_id, ig_access_token")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error(profileError.message);
  }

  const connected = Boolean(profile?.ig_user_id && profile?.ig_access_token);

  let insights = null;
  let recentMedia: Awaited<ReturnType<typeof getMyRecentMedia>>["media"] = [];
  let igError: string | null = null;

  if (connected && profile?.ig_user_id && profile.ig_access_token) {
    const [insightsResult, mediaResult] = await Promise.allSettled([
      getMyInsights(profile.ig_user_id, profile.ig_access_token),
      getMyRecentMedia(profile.ig_user_id, profile.ig_access_token),
    ]);

    if (insightsResult.status === "fulfilled") {
      insights = insightsResult.value;
    } else {
      igError = "Could not load Instagram insights. Your token may have expired — reconnect below.";
    }

    if (mediaResult.status === "fulfilled") {
      recentMedia = mediaResult.value.media.slice(0, 20);
    }
  }

  // Find top performer by likes
  const topPostId = recentMedia.reduce<string | null>((topId, m) => {
    if (!topId) return m.id;
    const topPost = recentMedia.find((x) => x.id === topId);
    return (m.like_count ?? 0) > (topPost?.like_count ?? 0) ? m.id : topId;
  }, null);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold text-white">My IG</h1>
        <p className="text-sm text-zinc-400">Your Instagram account overview and analytics.</p>
      </div>

      {igError ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-400">
          {igError}
        </div>
      ) : null}

      {/* Account Overview */}
      <section className="rounded-xl border border-[#1f1f1f] bg-[#111111] p-5 text-zinc-100">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-400">Account</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs text-zinc-500">Username</p>
            <p className="mt-1 font-medium text-white">
              {insights?.username ? `@${insights.username}` : profile?.username ?? user.email ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Instagram</p>
            <p className={`mt-1 font-medium ${connected ? "text-emerald-400" : "text-rose-400"}`}>
              {connected ? "Connected" : "Not connected"}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Followers</p>
            <p className="mt-1 text-2xl font-semibold text-white">
              {insights ? formatNumber(insights.followers_count) : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Total Posts</p>
            <p className="mt-1 text-2xl font-semibold text-white">
              {insights ? formatNumber(insights.media_count) : "—"}
            </p>
          </div>
        </div>

        {insights?.biography ? (
          <p className="mt-4 text-sm text-zinc-300">{insights.biography}</p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/dashboard/settings/instagram">Manage Connection</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/feed">Go to Feed</Link>
          </Button>
        </div>
      </section>

      {/* Recent Posts Table */}
      {recentMedia.length > 0 ? (
        <section className="rounded-xl border border-[#1f1f1f] bg-[#111111] p-5 text-zinc-100">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Recent Posts
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left">
                  <th className="pb-2 pr-4 text-xs font-medium text-zinc-500">Type</th>
                  <th className="pb-2 pr-4 text-xs font-medium text-zinc-500">Date</th>
                  <th className="pb-2 pr-4 text-xs font-medium text-zinc-500">Likes</th>
                  <th className="pb-2 pr-4 text-xs font-medium text-zinc-500">Comments</th>
                  <th className="pb-2 text-xs font-medium text-zinc-500">Link</th>
                </tr>
              </thead>
              <tbody>
                {recentMedia.map((post) => {
                  const isTop = post.id === topPostId;
                  return (
                    <tr
                      key={post.id}
                      className={`border-b border-zinc-800/50 ${isTop ? "bg-[#F9E400]/5" : ""}`}
                    >
                      <td className="py-2 pr-4 text-zinc-300">
                        {post.media_type ?? "—"}
                        {isTop ? (
                          <span className="ml-2 text-xs text-[#F9E400]">Top</span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-4 text-zinc-400">
                        {post.timestamp
                          ? new Date(post.timestamp).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })
                          : "—"}
                      </td>
                      <td className="py-2 pr-4 text-zinc-200">{formatNumber(post.like_count)}</td>
                      <td className="py-2 pr-4 text-zinc-200">{formatNumber(post.comments_count)}</td>
                      <td className="py-2">
                        {post.permalink ? (
                          <a
                            href={post.permalink}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[#F9E400] hover:underline"
                          >
                            View
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : connected && !igError ? (
        <div className="rounded-xl border border-dashed border-zinc-700 p-5 text-sm text-zinc-400">
          No recent posts found. Post something on Instagram and sync again.
        </div>
      ) : null}

      {!connected ? (
        <div className="rounded-xl border border-dashed border-zinc-700 p-5 text-sm text-zinc-400">
          Connect your Instagram account in{" "}
          <Link href="/dashboard/settings/instagram" className="text-[#F9E400] hover:underline">
            Settings
          </Link>{" "}
          to see analytics here.
        </div>
      ) : null}
    </div>
  );
}
