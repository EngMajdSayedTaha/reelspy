import { redirect } from "next/navigation";
import Link from "next/link";
import { Settings2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { PLATFORM_LABELS, type Platform } from "@/lib/publishing/types";
import { PublishComposer } from "@/components/publishing/PublishComposer";
import { RetryButton, DeletePostButton } from "@/components/publishing/PostActions";

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
  status: string;
  scheduled_at: string | null;
  created_at: string;
  publish_jobs: JobRow[];
};

const STATUS_STYLES: Record<string, string> = {
  published: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  done: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  failed: "border-rose-500/40 bg-rose-500/10 text-rose-400",
  publishing: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  processing: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  scheduled: "border-sky-500/40 bg-sky-500/10 text-sky-400",
  pending: "border-border-strong bg-border-strong/40 text-muted-foreground",
  draft: "border-border-strong bg-border-strong/40 text-muted-foreground",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? STATUS_STYLES.pending;
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {status}
    </span>
  );
}

function formatDateTime(value: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function PublishingPage() {
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
      .select("id, title, caption, status, scheduled_at, created_at, publish_jobs(id, platform, status, remote_url, error_message, caption)")
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-semibold text-foreground">Publishing</h1>
          <p className="text-sm text-muted-foreground">
            Upload once, post to Instagram, Facebook, TikTok &amp; YouTube — now or scheduled.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard/connections">
            <Settings2 className="h-4 w-4" /> Connections
          </Link>
        </Button>
      </div>

      <PublishComposer connected={connected} handle={previewHandle} />

      {/* History */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Recent posts</h2>
        {!posts || posts.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-background px-4 py-8 text-center text-sm text-muted-foreground">
            Nothing published yet. Your posts will show here with per-platform status.
          </p>
        ) : (
          <ul className="space-y-3">
            {posts.map((post) => (
              <li key={post.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {post.title || post.caption || "Untitled post"}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {post.scheduled_at
                        ? `Scheduled · ${formatDateTime(post.scheduled_at)}`
                        : `Created · ${formatDateTime(post.created_at)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={post.status} />
                    <DeletePostButton postId={post.id} />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                  {post.publish_jobs.map((job) => (
                    <div
                      key={job.id}
                      className="flex flex-col gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-foreground">
                          {PLATFORM_LABELS[job.platform]}
                        </span>
                        <StatusBadge status={job.status} />
                        {job.remote_url ? (
                          <a
                            href={job.remote_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-muted-foreground hover:text-foreground"
                            title="View post"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ) : null}
                        {job.status === "failed" ? <RetryButton jobId={job.id} /> : null}
                        {job.status === "failed" && job.error_message ? (
                          <span className="max-w-[16rem] truncate text-xs text-rose-400" title={job.error_message}>
                            {job.error_message}
                          </span>
                        ) : null}
                      </div>
                      {job.caption ? (
                        <span
                          className="max-w-[16rem] truncate text-[11px] text-muted-foreground"
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
