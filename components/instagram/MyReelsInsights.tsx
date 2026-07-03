"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bookmark,
  Check,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Clock,
  Copy,
  Download,
  Eye,
  FileJson,
  FileSpreadsheet,
  FileText,
  Heart,
  MessageCircle,
  RefreshCw,
  Send,
  TrendingUp,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { InsightsCharts } from "@/components/instagram/InsightsCharts";
import {
  buildAiSummary,
  buildInsightsCsv,
  buildInsightsJson,
  downloadFile,
  engagementRateOf,
  formatCompact,
  isReelItem,
  type MediaItem,
  type ProfileSummary,
  type Totals,
} from "@/lib/instagram/insights-export";
import { ApiError, notifyError, requestJson } from "@/lib/utils/api";

const INITIAL_REELS = 6;

type MyReelsResponse = {
  connected?: boolean;
  profile?: ProfileSummary;
  media?: MediaItem[];
  totals?: Totals;
  partial?: boolean;
  synced_at?: string;
  error?: string;
};

function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

const SORTS = [
  { key: "recent", label: "Newest" },
  { key: "views", label: "Most views" },
  { key: "likes", label: "Most likes" },
  { key: "comments", label: "Most comments" },
  { key: "engagement", label: "Top engagement" },
] as const;

type SortKey = (typeof SORTS)[number]["key"];

const TYPE_FILTERS = [
  { key: "all", label: "All" },
  { key: "reels", label: "Reels" },
  { key: "posts", label: "Posts" },
] as const;

type TypeFilter = (typeof TYPE_FILTERS)[number]["key"];

function sortMedia(items: MediaItem[], sort: SortKey): MediaItem[] {
  const val = {
    recent: (m: MediaItem) => (m.timestamp ? new Date(m.timestamp).getTime() : 0),
    views: (m: MediaItem) => m.insights?.views ?? 0,
    likes: (m: MediaItem) => m.insights?.likes ?? m.like_count ?? 0,
    comments: (m: MediaItem) => m.insights?.comments ?? m.comments_count ?? 0,
    engagement: (m: MediaItem) => engagementRateOf(m) ?? -1,
  }[sort];
  return items.slice().sort((a, b) => val(b) - val(a));
}

function StatBox({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2 p-3.5">
      <div className="flex items-center gap-1.5 text-xs text-subtle">
        {icon}
        {label}
      </div>
      <p className="mt-1.5 text-xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function Metric({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground" title={label}>
      <span className="text-subtle">{icon}</span>
      {value}
    </span>
  );
}

/** Export menu: CSV / JSON downloads plus an AI-ready markdown summary. */
function ExportMenu({
  profile,
  totals,
  media,
}: {
  profile: ProfileSummary | null;
  totals: Totals | null;
  media: MediaItem[];
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const stamp = new Date().toISOString().slice(0, 10);
  const slug = profile?.username ? `${profile.username}-` : "";

  const copyAiSummary = async () => {
    try {
      await navigator.clipboard.writeText(buildAiSummary(profile, media));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked — fall back to downloading the file.
      downloadFile(`${slug}insights-${stamp}.md`, buildAiSummary(profile, media), "text/markdown");
    }
  };

  const items = [
    {
      icon: <FileSpreadsheet className="h-3.5 w-3.5" />,
      label: "Download CSV",
      onClick: () => downloadFile(`${slug}insights-${stamp}.csv`, buildInsightsCsv(media), "text/csv"),
    },
    {
      icon: <FileJson className="h-3.5 w-3.5" />,
      label: "Download JSON",
      onClick: () =>
        downloadFile(`${slug}insights-${stamp}.json`, buildInsightsJson(profile, totals, media), "application/json"),
    },
    {
      icon: <FileText className="h-3.5 w-3.5" />,
      label: "Download AI summary (.md)",
      onClick: () =>
        downloadFile(`${slug}insights-${stamp}.md`, buildAiSummary(profile, media), "text/markdown"),
    },
    {
      icon: copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />,
      label: copied ? "Copied!" : "Copy AI summary",
      onClick: copyAiSummary,
      keepOpen: true,
    },
  ];

  return (
    <div ref={ref} className="relative">
      <Button type="button" variant="outline" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <Download className="h-4 w-4" />
        Export
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </Button>
      {open ? (
        <div className="absolute right-0 top-full z-20 mt-1.5 w-56 overflow-hidden rounded-xl border border-border-strong bg-surface-2 p-1 shadow-xl">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => {
                item.onClick();
                if (!item.keepOpen) setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-border hover:text-foreground"
            >
              <span className="text-subtle">{item.icon}</span>
              {item.label}
            </button>
          ))}
          <p className="border-t border-border px-2.5 py-1.5 text-[10px] text-subtle">
            The AI summary is formatted to paste straight into a chat.
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function MyReelsInsights({ connected }: { connected: boolean }) {
  const [data, setData] = useState<MyReelsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(connected);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [sort, setSort] = useState<SortKey>("recent");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  const load = useCallback(async (force = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const json = await requestJson<MyReelsResponse>(
        force ? "/api/ig/my-reels?refresh=1" : "/api/ig/my-reels",
        { cache: "no-store" }
      );
      setData(json);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Could not load your Instagram insights.");
      }
      notifyError(err, "Could not load your Instagram insights.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (connected) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- kicks off the initial async fetch
      load();
    }
  }, [connected, load]);

  if (!connected) return null;

  const media = data?.media ?? [];
  const totals = data?.totals ?? null;
  const profile = data?.profile ?? null;
  const reels = media.filter(isReelItem);

  // Top performer among analyzed reels (views first, likes fallback).
  const top = reels
    .filter((m) => m.insights)
    .reduce<MediaItem | null>((best, m) => {
      if (!best) return m;
      const score = (x: MediaItem) => x.insights?.views ?? x.like_count ?? 0;
      return score(m) > score(best) ? m : best;
    }, null);

  // Grid: type filter + sort, collapsed to the first 6 until "Show all".
  const typed =
    typeFilter === "all"
      ? media
      : media.filter((m) => (typeFilter === "reels" ? isReelItem(m) : !isReelItem(m)));
  const sorted = sortMedia(typed, sort);
  const visible = showAll ? sorted : sorted.slice(0, INITIAL_REELS);

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5 text-foreground">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Clapperboard className="h-5 w-5 text-brand" />
            My Reels &amp; Insights
          </h2>
          <p className="text-sm text-muted-foreground">
            Everything Instagram shares about your own content — views, reach, saves, shares and
            watch time.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            {media.length > 0 ? <ExportMenu profile={profile} totals={totals} media={media} /> : null}
            <Button type="button" variant="outline" onClick={() => load(true)} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              {isLoading ? "Syncing…" : "Sync my reels"}
            </Button>
          </div>
          {data?.synced_at ? (
            <p className="text-[11px] text-subtle">Updated {timeAgo(data.synced_at)}</p>
          ) : null}
        </div>
      </div>

      {data?.partial ? (
        <p className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
          Instagram throttled part of this sync — some reels show basic metrics only. Sync again
          later for the rest.
        </p>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {isLoading && !data ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-2xl" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-64 rounded-2xl" />
            ))}
          </div>
        </>
      ) : null}

      {totals && totals.analyzed > 0 ? (
        <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatBox icon={<Eye className="h-3.5 w-3.5" />} label="Views" value={formatCompact(totals.views)} />
          <StatBox icon={<Users className="h-3.5 w-3.5" />} label="Reach" value={formatCompact(totals.reach)} />
          <StatBox icon={<Heart className="h-3.5 w-3.5" />} label="Likes" value={formatCompact(totals.likes)} />
          <StatBox
            icon={<MessageCircle className="h-3.5 w-3.5" />}
            label="Comments"
            value={formatCompact(totals.comments)}
          />
          <StatBox icon={<Bookmark className="h-3.5 w-3.5" />} label="Saves" value={formatCompact(totals.saved)} />
          <StatBox icon={<Send className="h-3.5 w-3.5" />} label="Shares" value={formatCompact(totals.shares)} />
        </div>
      ) : null}

      {totals && totals.analyzed > 0 ? (
        <p className="text-xs text-subtle">
          Totals across your {totals.analyzed} most recent posts with full insights.
        </p>
      ) : null}

      {totals && totals.analyzed > 0 ? (
        <InsightsCharts media={media} followers={profile?.followers_count} />
      ) : null}

      {!isLoading && media.length === 0 && !error ? (
        <div className="rounded-xl border border-dashed border-border-strong p-5 text-center text-sm text-muted-foreground">
          No posts found on your account yet. Post a reel, then sync again.
        </div>
      ) : null}

      {media.length > 0 ? (
        <>
          {/* Grid controls: content type + sort order */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-1.5">
              {TYPE_FILTERS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTypeFilter(t.key)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    typeFilter === t.key
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:bg-border-strong hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-subtle">
                Showing {visible.length} of {sorted.length}
              </span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                aria-label="Sort posts"
                className="h-8 rounded-lg border border-border bg-surface-2 px-2 text-xs text-muted-foreground outline-none transition-colors hover:border-border-strong focus:border-primary/50"
              >
                {SORTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {sorted.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border-strong p-4 text-center text-sm text-muted-foreground">
              Nothing matches this filter.
            </p>
          ) : (
            <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((item) => {
                const ins = item.insights;
                const isTop = top != null && item.id === top.id;
                const posted = item.timestamp
                  ? new Date(item.timestamp).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : null;
                const thumb = item.thumbnail_url ?? (isReelItem(item) ? null : item.media_url) ?? null;

                return (
                  <article
                    key={item.id}
                    className={`flex flex-col overflow-hidden rounded-2xl border bg-surface-2 transition-colors ${
                      isTop ? "border-primary/50" : "border-border hover:border-border-strong"
                    }`}
                  >
                    <a
                      href={item.permalink}
                      target="_blank"
                      rel="noreferrer"
                      className="relative block aspect-[4/5] w-full overflow-hidden bg-background"
                    >
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumb}
                          alt={item.caption?.slice(0, 60) ?? "Instagram post"}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      ) : (
                        <span className="absolute inset-0 flex items-center justify-center">
                          <Clapperboard className="h-10 w-10 text-subtle" />
                        </span>
                      )}
                      <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white backdrop-blur-sm">
                        {isReelItem(item) ? "Reel" : (item.media_type ?? "Post").toLowerCase()}
                      </span>
                      {isTop ? (
                        <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                          <TrendingUp className="h-3 w-3" />
                          Top performer
                        </span>
                      ) : null}
                      {ins?.views != null ? (
                        <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
                          <Eye className="h-3 w-3" />
                          {formatCompact(ins.views)}
                        </span>
                      ) : null}
                    </a>

                    <div className="flex flex-1 flex-col gap-2 p-3">
                      {posted ? <p className="text-xs text-subtle">{posted}</p> : null}
                      {item.caption ? (
                        <p className="line-clamp-2 text-xs text-muted-foreground">{item.caption}</p>
                      ) : null}

                      <div className="mt-auto flex flex-wrap gap-x-3 gap-y-1 pt-1">
                        <Metric
                          icon={<Heart className="h-3.5 w-3.5" />}
                          value={formatCompact(ins?.likes ?? item.like_count)}
                          label="Likes"
                        />
                        <Metric
                          icon={<MessageCircle className="h-3.5 w-3.5" />}
                          value={formatCompact(ins?.comments ?? item.comments_count)}
                          label="Comments"
                        />
                        {ins?.reach != null ? (
                          <Metric icon={<Users className="h-3.5 w-3.5" />} value={formatCompact(ins.reach)} label="Reach" />
                        ) : null}
                        {ins?.saved != null ? (
                          <Metric icon={<Bookmark className="h-3.5 w-3.5" />} value={formatCompact(ins.saved)} label="Saves" />
                        ) : null}
                        {ins?.shares != null ? (
                          <Metric icon={<Send className="h-3.5 w-3.5" />} value={formatCompact(ins.shares)} label="Shares" />
                        ) : null}
                        {ins?.avg_watch_time_ms != null ? (
                          <Metric
                            icon={<Clock className="h-3.5 w-3.5" />}
                            value={`${(ins.avg_watch_time_ms / 1000).toFixed(1)}s`}
                            label="Average watch time"
                          />
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {sorted.length > INITIAL_REELS ? (
            <div className="flex justify-center pt-1">
              <Button type="button" variant="outline" onClick={() => setShowAll((v) => !v)}>
                {showAll ? (
                  <>
                    <ChevronUp className="h-4 w-4" />
                    Show less
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4" />
                    Show all {sorted.length} posts
                  </>
                )}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
