"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Images, RadioTower } from "lucide-react";
import { PLATFORM_ICONS } from "@/components/publishing/platform-icons";
import { LocalDateTime } from "@/components/publishing/LocalDateTime";
import {
  DeletePostButton,
  DuplicatePostButton,
  EditPostButton,
  RetryButton,
} from "@/components/publishing/PostActions";
import { PLATFORM_LABELS, type Platform } from "@/lib/publishing/types";
import { useDict } from "@/lib/i18n/I18nProvider";

export type PostJob = {
  id: string;
  platform: Platform;
  status: string;
  remote_url: string | null;
  error_message: string | null;
  caption: string | null;
};

export type PostRow = {
  id: string;
  title: string | null;
  caption: string | null;
  hashtags: string | null;
  status: string;
  media_kind: string | null;
  media_count: number;
  scheduled_at: string | null;
  created_at: string;
  publish_jobs: PostJob[];
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

// A post in one of these is still moving, so it's worth polling for.
const LIVE_POST_STATUSES = new Set(["publishing", "processing"]);
const LIVE_JOB_STATUSES = new Set(["pending", "processing"]);

type Filter = "all" | "scheduled" | "published" | "failed";

export function StatusBadge({ status, labels }: { status: string; labels: Record<string, string> }) {
  const cls = STATUS_STYLES[status] ?? STATUS_STYLES.pending;
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {labels[status] ?? status}
    </span>
  );
}

/**
 * The publish history, kept live.
 *
 * Publishing is asynchronous now — the composer returns as soon as the job is
 * queued — so a post that says "Publishing" has to be able to become "Done" on
 * its own. This polls /api/publishing/status for exactly the posts that are
 * still moving, backs off as it waits, and stops entirely once everything is
 * terminal, so an idle tab isn't hitting the server forever.
 */
export function PostList({ initialPosts }: { initialPosts: PostRow[] }) {
  const t = useDict().publishing;
  const [posts, setPosts] = useState(initialPosts);
  const [filter, setFilter] = useState<Filter>("all");

  // Server-rendered data wins whenever the page revalidates (a publish, a
  // delete, a duplicate) — otherwise a stale poll result would overwrite it.
  // Adjusted during render rather than in an effect: React's own "resetting
  // state when a prop changes" pattern, which re-renders immediately instead of
  // painting one frame of stale rows.
  const [lastServerPosts, setLastServerPosts] = useState(initialPosts);
  if (initialPosts !== lastServerPosts) {
    setLastServerPosts(initialPosts);
    setPosts(initialPosts);
  }

  const liveIds = useMemo(
    () =>
      posts
        .filter(
          (post) =>
            LIVE_POST_STATUSES.has(post.status) ||
            post.publish_jobs.some((job) => LIVE_JOB_STATUSES.has(job.status))
        )
        .map((post) => post.id),
    [posts]
  );

  const liveKey = liveIds.join(",");
  const pollsRef = useRef(0);

  const poll = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    try {
      const res = await fetch(`/api/publishing/status?ids=${ids.join(",")}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const body = (await res.json()) as {
        posts: Array<{ id: string; status: string; publish_jobs: PostJob[] }>;
      };
      setPosts((prev) =>
        prev.map((post) => {
          const fresh = body.posts.find((p) => p.id === post.id);
          if (!fresh) return post;
          return {
            ...post,
            status: fresh.status,
            // Keep the server's per-job caption: the status route doesn't
            // return it, and dropping it would blank the "✎ override" line.
            publish_jobs: fresh.publish_jobs.map((job) => ({
              ...job,
              caption: post.publish_jobs.find((j) => j.id === job.id)?.caption ?? null,
            })),
          };
        })
      );
    } catch {
      // Offline or a blip — the next tick tries again.
    }
  }, []);

  useEffect(() => {
    if (!liveKey) {
      pollsRef.current = 0;
      return;
    }
    const ids = liveKey.split(",");
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (cancelled) return;
      await poll(ids);
      if (cancelled) return;
      pollsRef.current += 1;
      // Tight while a publish is likely to land, then back off so a stuck
      // platform doesn't mean a request every 3 seconds for ten minutes.
      const delay = pollsRef.current < 10 ? 3000 : pollsRef.current < 30 ? 10_000 : 30_000;
      timer = setTimeout(tick, delay);
    };

    timer = setTimeout(tick, 3000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [liveKey, poll]);

  const filtered = posts.filter((post) => {
    if (filter === "all") return true;
    if (filter === "scheduled") return post.status === "scheduled";
    if (filter === "published") return post.status === "done";
    return (
      post.status === "failed" ||
      post.status === "partial" ||
      post.publish_jobs.some((job) => job.status === "failed")
    );
  });

  const filters: Array<{ key: Filter; label: string }> = [
    { key: "all", label: t.filterAll },
    { key: "scheduled", label: t.filterScheduled },
    { key: "published", label: t.filterPublished },
    { key: "failed", label: t.filterFailed },
  ];

  return (
    <div data-tour="publish-history" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-foreground">{t.recentPosts}</h2>
        <div className="flex items-center gap-2">
          {liveIds.length > 0 ? (
            <span className="flex items-center gap-1 text-[11px] font-medium text-info">
              <RadioTower className="h-3 w-3 animate-pulse" /> {t.liveUpdating}
            </span>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            {filters.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                  filter === f.key
                    ? "border-accent-brand bg-accent-brand/10 text-accent-brand"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {posts.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-background px-4 py-8 text-center text-sm text-muted-foreground">
          {t.emptyHistory}
        </p>
      ) : filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-background px-4 py-8 text-center text-sm text-muted-foreground">
          {t.filterEmpty}
        </p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((post) => (
            <li key={post.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {post.title || post.caption || t.untitledPost}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    {post.scheduled_at ? (
                      <LocalDateTime value={post.scheduled_at} prefix={t.scheduledPrefix} />
                    ) : (
                      <LocalDateTime value={post.created_at} prefix={t.createdPrefix} />
                    )}
                    {post.media_count > 1 ? (
                      <span className="flex items-center gap-1">
                        <Images className="h-3 w-3" /> {t.slideCount(post.media_count)}
                      </span>
                    ) : null}
                  </p>
                </div>
                <div className="flex items-center gap-1">
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
                  <DuplicatePostButton postId={post.id} />
                  <DeletePostButton postId={post.id} />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                {post.publish_jobs.map((job) => {
                  const Icon = PLATFORM_ICONS[job.platform];
                  return (
                    <div
                      key={job.id}
                      className="flex min-w-0 max-w-full flex-col gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="flex items-center gap-1 text-xs font-medium text-foreground">
                          {Icon ? <Icon className="h-3 w-3" /> : null}
                          {PLATFORM_LABELS[job.platform] ?? job.platform}
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
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
