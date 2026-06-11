"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bookmark,
  Clapperboard,
  Clock,
  Eye,
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
import { ApiError, notifyError, requestJson } from "@/lib/utils/api";

type MediaInsights = {
  views?: number;
  reach?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saved?: number;
  total_interactions?: number;
  avg_watch_time_ms?: number;
};

type MediaItem = {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  permalink?: string;
  thumbnail_url?: string;
  media_url?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
  insights: MediaInsights | null;
};

type Totals = {
  analyzed: number;
  views: number;
  reach: number;
  likes: number;
  comments: number;
  saved: number;
  shares: number;
};

type MyReelsResponse = {
  connected?: boolean;
  media?: MediaItem[];
  totals?: Totals;
  partial?: boolean;
  error?: string;
};

function formatCompact(value: number | null | undefined): string {
  const n = value ?? 0;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}K`;
  return new Intl.NumberFormat("en-US").format(n);
}

// The Instagram sync walks up to 60 media + 30 insight calls and takes a
// while, so the result is cached locally: revisits render instantly from the
// last sync, and "Sync my reels" refreshes on demand. Keyed per user so a
// different login on the same browser never sees someone else's data.
function cacheKey(userId: string) {
  return `reelspy:my-reels:v1:${userId}`;
}

type CachedSync = { savedAt: number; data: MyReelsResponse };

function readSyncCache(userId: string): CachedSync | null {
  try {
    const raw = localStorage.getItem(cacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedSync;
    if (!parsed || typeof parsed.savedAt !== "number" || !parsed.data) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSyncCache(userId: string, data: MyReelsResponse) {
  try {
    localStorage.setItem(cacheKey(userId), JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    // Storage full or unavailable — caching is best-effort.
  }
}

function isReel(item: MediaItem): boolean {
  return (
    String(item.media_product_type ?? "").toUpperCase() === "REELS" ||
    String(item.media_type ?? "").toUpperCase() === "VIDEO"
  );
}

function StatBox({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#1f1f1f] bg-[#141414] p-3.5">
      <div className="flex items-center gap-1.5 text-xs text-zinc-500">
        {icon}
        {label}
      </div>
      <p className="mt-1.5 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}

function Metric({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-xs text-zinc-300" title={label}>
      <span className="text-zinc-500">{icon}</span>
      {value}
    </span>
  );
}

export function MyReelsInsights({ connected, userId }: { connected: boolean; userId: string }) {
  const [data, setData] = useState<MyReelsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(connected);
  const [error, setError] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const json = await requestJson<MyReelsResponse>("/api/ig/my-reels", { cache: "no-store" });
      setData(json);
      setSyncedAt(Date.now());
      writeSyncCache(userId, json);
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
  }, [userId]);

  useEffect(() => {
    if (!connected) return;
    // Serve the last sync instantly when we have one; only the very first
    // visit (no cache yet) syncs automatically.
    const cached = readSyncCache(userId);
    if (cached) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrates from localStorage, which isn't readable during SSR render
      setData(cached.data);
      setSyncedAt(cached.savedAt);
      setIsLoading(false);
    } else {
      load();
    }
  }, [connected, userId, load]);

  if (!connected) return null;

  const media = data?.media ?? [];
  const totals = data?.totals;
  const reels = media.filter(isReel);

  // Top performer among analyzed reels (views first, likes fallback).
  const top = reels
    .filter((m) => m.insights)
    .reduce<MediaItem | null>((best, m) => {
      if (!best) return m;
      const score = (x: MediaItem) => x.insights?.views ?? x.like_count ?? 0;
      return score(m) > score(best) ? m : best;
    }, null);

  return (
    <section className="space-y-4 rounded-xl border border-[#1f1f1f] bg-[#111111] p-5 text-zinc-100">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            <Clapperboard className="h-5 w-5 text-[#F9E400]" />
            My Reels &amp; Insights
          </h2>
          <p className="text-sm text-zinc-400">
            Everything Instagram shares about your own content — views, reach, saves, shares and
            watch time.
          </p>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <Button type="button" variant="outline" onClick={load} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            {isLoading ? "Syncing…" : "Sync my reels"}
          </Button>
          {syncedAt && !isLoading ? (
            <p className="text-xs text-zinc-500">
              Last synced{" "}
              {new Date(syncedAt).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          ) : null}
        </div>
      </div>

      {data?.partial ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
          Instagram throttled part of this sync — some reels show basic metrics only. Sync again
          later for the rest.
        </p>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-sm text-rose-300">
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
        <p className="text-xs text-zinc-500">
          Totals across your {totals.analyzed} most recent posts with full insights.
        </p>
      ) : null}

      {/* Bigger-picture trends across the analyzed posts. */}
      {media.length > 0 ? <InsightsCharts media={media} /> : null}

      {!isLoading && media.length === 0 && !error ? (
        <div className="rounded-xl border border-dashed border-zinc-700 p-5 text-center text-sm text-zinc-400">
          No posts found on your account yet. Post a reel, then sync again.
        </div>
      ) : null}

      {media.length > 0 ? (
        <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {media.map((item) => {
            const ins = item.insights;
            const isTop = top != null && item.id === top.id;
            const posted = item.timestamp
              ? new Date(item.timestamp).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : null;
            const thumb = item.thumbnail_url ?? (isReel(item) ? null : item.media_url) ?? null;

            return (
              <article
                key={item.id}
                className={`flex flex-col overflow-hidden rounded-2xl border bg-[#141414] transition-colors ${
                  isTop ? "border-[#F9E400]/50" : "border-[#1f1f1f] hover:border-[#2e2e2e]"
                }`}
              >
                <a
                  href={item.permalink}
                  target="_blank"
                  rel="noreferrer"
                  className="relative block aspect-[4/5] w-full overflow-hidden bg-[#0a0a0a]"
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
                      <Clapperboard className="h-10 w-10 text-zinc-700" />
                    </span>
                  )}
                  <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white backdrop-blur-sm">
                    {isReel(item) ? "Reel" : (item.media_type ?? "Post").toLowerCase()}
                  </span>
                  {isTop ? (
                    <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-[#F9E400] px-2 py-0.5 text-[10px] font-semibold text-black">
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
                  {posted ? <p className="text-xs text-zinc-500">{posted}</p> : null}
                  {item.caption ? (
                    <p className="line-clamp-2 text-xs text-zinc-300">{item.caption}</p>
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
      ) : null}
    </section>
  );
}
