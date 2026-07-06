import { redirect } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import { Settings2, ExternalLink, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { PLATFORM_LABELS, type Platform } from "@/lib/publishing/types";
import { PublishComposer } from "@/components/publishing/PublishComposer";
import { LocalDateTime } from "@/components/publishing/LocalDateTime";
import { RetryButton, DeletePostButton, EditPostButton } from "@/components/publishing/PostActions";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { getDictionary } from "@/lib/i18n/dictionaries";

type JobRow = {
  id: string;
  platform: Platform;
  status: string;
  remote_url: string | null;
  error_message: string | null;
  caption: string | null;
};

type PostRow = {
  id: string;
  title: string | null;
  caption: string | null;
  hashtags: string | null;
  status: string;
  scheduled_at: string | null;
  created_at: string;
  publish_jobs: JobRow[];
};

const STATUS_STYLES: Record<string, string> = {
  published: "border-success/40 bg-success/10 text-success",
  done: "border-success/40 bg-success/10 text-success",
  partial: "border-warning/40 bg-warning/10 text-warning",
  failed: "border-danger/40 bg-danger/10 text-danger",
  publishing: "border-warning/40 bg-warning/10 text-warning",
  processing: "border-warning/40 bg-warning/10 text-warning",
  scheduled: "border-info/40 bg-info/10 text-info",
  pending: "border-border-strong bg-border-strong/40 text-muted-foreground",
  draft: "border-border-strong bg-border-strong/40 text-muted-foreground",
};

function StatusBadge({
  status,
  labels,
}: {
  status: string;
  labels: Record<string, string>;
}) {
  const cls = STATUS_STYLES[status] ?? STATUS_STYLES.pending;
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {labels[status] ?? status}
    </span>
  );
}

export default async function PublishingPage() {
  const { locale } = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  const dict = getDictionary(locale);
  const t = dict.publishing;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Connection state: IG/FB live on the profile (browser-readable metadata),
  // TikTok/YouTube in social_connections.
  const [{ data: profile }, { data: conns }, { data: posts }] = await Promise.all([
    supabase.from("profiles").select("ig_user_id, fb_page_id, username").eq("id", user.id).maybeSingle(),
    supabase
      .from("social_connections")
      .select("platform, token_status, is_active")
      .eq("user_id", user.id),
    supabase
      .from("publish_posts")
      .select("id, title, caption, hashtags, status, scheduled_at, created_at, publish_jobs(id, platform, status, remote_url, error_message, caption)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(25)
      .returns<PostRow[]>(),
  ]);

  const activeConn = (p: Platform) =>
    Boolean(conns?.some((c) => c.platform === p && c.is_active && c.token_status !== "invalid"));

  const connected: Record<Platform, boolean> = {
    instagram: Boolean(profile?.ig_user_id),
    facebook: Boolean(profile?.fb_page_id),
    tiktok: activeConn("tiktok"),
    youtube: activeConn("youtube"),
  };

  const previewHandle = profile?.username || user.email?.split("@")[0] || "your_account";

  // Whether each platform can actually post publicly. TikTok & YouTube force
  // private/self-only until their app audit passes; the founder flips these env
  // flags post-audit and the composer's warning disappears on its own.
  const publicAllowed: Record<Platform, boolean> = {
    instagram: true,
    facebook: true,
    tiktok: process.env.TIKTOK_ALLOW_PUBLIC === "true",
    youtube: process.env.YOUTUBE_ALLOW_PUBLIC === "true",
  };

  // Posts that finished with at least one failed target — surface them up top so
  // a partial/failed publish isn't buried in the history list.
  const needsAttention = (posts ?? []).filter(
    (p) =>
      (p.status === "partial" || p.status === "failed") &&
      p.publish_jobs.some((j) => j.status === "failed")
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-semibold text-foreground">{dict.titles.publishing}</h1>
          <p className="text-sm text-muted-foreground">{t.subtitle}</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard/connections">
            <Settings2 className="h-4 w-4" /> {dict.nav.connections}
          </Link>
        </Button>
      </div>

      <PublishComposer connected={connected} handle={previewHandle} publicAllowed={publicAllowed} />

      {needsAttention.length > 0 ? (
        <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div className="min-w-0 text-sm">
            <p className="font-medium text-foreground">{t.postsDidntPublish(needsAttention.length)}</p>
            <p className="mt-0.5 text-muted-foreground">
              {t.reviewFailedIntro}{" "}
              <span className="font-medium text-foreground">{dict.common.retry}</span> {t.reviewFailedOutro}
            </p>
          </div>
        </div>
      ) : null}

      {/* History */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">{t.recentPosts}</h2>
        {!posts || posts.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-background px-4 py-8 text-center text-sm text-muted-foreground">
            {t.emptyHistory}
          </p>
        ) : (
          <ul className="space-y-3">
            {posts.map((post) => (
              <li key={post.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {post.title || post.caption || t.untitledPost}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {post.scheduled_at ? (
                        <LocalDateTime value={post.scheduled_at} prefix={t.scheduledPrefix} />
                      ) : (
                        <LocalDateTime value={post.created_at} prefix={t.createdPrefix} />
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={post.status} labels={t.status} />
                    {post.status === "scheduled" && post.scheduled_at ? (
                      <EditPostButton
                        postId={post.id}
                        title={post.title}
                        caption={post.caption}
                        hashtags={post.hashtags}
                        scheduledAt={post.scheduled_at}
                      />
                    ) : null}
                    <DeletePostButton postId={post.id} />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                  {post.publish_jobs.map((job) => (
                    <div
                      key={job.id}
                      className="flex min-w-0 max-w-full flex-col gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium text-foreground">
                          {PLATFORM_LABELS[job.platform]}
                        </span>
                        <StatusBadge status={job.status} labels={t.status} />
                        {job.remote_url ? (
                          <a
                            href={job.remote_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-muted-foreground hover:text-foreground"
                            title={t.viewPost}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ) : null}
                        {job.status === "failed" ? <RetryButton jobId={job.id} /> : null}
                        {job.status === "failed" && job.error_message ? (
                          <span
                            className="max-w-full truncate text-xs text-danger sm:max-w-[16rem]"
                            title={job.error_message}
                          >
                            {job.error_message}
                          </span>
                        ) : null}
                      </div>
                      {job.caption ? (
                        <span
                          className="max-w-full truncate text-[11px] text-muted-foreground sm:max-w-[16rem]"
                          title={job.caption}
                        >
                          ✎ {job.caption}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
