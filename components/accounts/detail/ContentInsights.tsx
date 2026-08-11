"use client";

import { AlignLeft, FileText, Hash, ThumbsDown, Trophy, Users } from "lucide-react";
import { ChartCard } from "@/components/charts/primitives";
import { Leaderboard, type LeaderboardEntry } from "@/components/charts/Leaderboard";
import { useDict, useLocale } from "@/lib/i18n/I18nProvider";
import { formatCompact } from "@/lib/instagram/insights-export";
import { formatPercent, formatShortDay } from "@/components/accounts/detail/format";
import type { CaptionBucket, ReelSummary, TagStat } from "@/lib/accounts/metrics";
import type { OutperformRow } from "@/lib/accounts/detail";

export function ContentInsights({
  top,
  bottom,
  outperformers,
  hashtags,
  mentions,
  captions,
  transcripts,
}: {
  top: ReelSummary[];
  bottom: ReelSummary[];
  outperformers: OutperformRow[];
  hashtags: TagStat[];
  mentions: TagStat[];
  captions: CaptionBucket[];
  transcripts: { ready: number; failed: number; total: number; pct: number | null };
}) {
  const dict = useDict();
  const locale = useLocale();
  const t = dict.accounts.detail.content;

  const reelEntries = (reels: ReelSummary[]): LeaderboardEntry[] =>
    reels.map((reel) => ({
      id: reel.id,
      title: reel.caption || formatShortDay(reel.posted_at, locale) || "—",
      thumbnail: reel.thumbnail_url,
      value: reel.views,
      valueLabel: formatCompact(reel.views),
      subLabel: reel.engagementRate != null ? `${reel.engagementRate.toFixed(1)}% ER` : null,
      href: reel.ig_permalink,
    }));

  const captionLabel: Record<CaptionBucket["key"], string> = {
    short: t.captionShort,
    medium: t.captionMedium,
    long: t.captionLong,
    essay: t.captionEssay,
  };

  const captionMax = Math.max(1, ...captions.map((c) => c.medianViews ?? 0));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title={t.topPerformers} icon={<Trophy className="h-4 w-4" />} hint={t.topHint}>
          <Leaderboard entries={reelEntries(top)} />
        </ChartCard>

        <ChartCard title={t.weakest} icon={<ThumbsDown className="h-4 w-4" />} hint={t.weakestHint}>
          {/* No hero highlight: rank 1 here is the *worst* post, and painting it
              in the brand colour would read as an endorsement. */}
          <Leaderboard entries={reelEntries(bottom)} highlightFirst={false} />
        </ChartCard>
      </div>

      {outperformers.length > 0 ? (
        <ChartCard
          title={t.outperformers}
          icon={<Trophy className="h-4 w-4" />}
          hint={t.outperformersHint}
        >
          <Leaderboard
            entries={outperformers.map((row) => ({
              id: row.id,
              title:
                row.caption?.replace(/\s+/g, " ").slice(0, 120) ||
                formatShortDay(row.posted_at, locale) ||
                "—",
              thumbnail: row.thumbnail_url,
              value: row.outperform_ratio ?? 0,
              valueLabel: `${(row.outperform_ratio ?? 0).toFixed(1)}×`,
              subLabel: formatCompact(row.view_count ?? 0),
              href: row.ig_permalink,
            }))}
          />
        </ChartCard>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title={t.hashtags} icon={<Hash className="h-4 w-4" />} hint={t.hashtagsHint}>
          {hashtags.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t.noCaptions}</p>
          ) : (
            <Leaderboard
              entries={hashtags.map((tag) => ({
                id: tag.tag,
                title: tag.tag,
                value: tag.count,
                valueLabel: formatCompact(Math.round(tag.medianViews ?? 0)),
                subLabel: t.reelsUsing(tag.count),
              }))}
            />
          )}
        </ChartCard>

        <div className="space-y-4">
          <ChartCard title={t.captionLength} icon={<AlignLeft className="h-4 w-4" />}>
            <div className="flex h-32 items-end gap-2">
              {captions.map((bucket) => (
                <div key={bucket.key} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] tabular-nums text-subtle">
                    {bucket.count > 0 ? formatCompact(Math.round(bucket.medianViews ?? 0)) : ""}
                  </span>
                  <div
                    className="w-full rounded-t-md bg-border-strong"
                    style={{
                      height: `${Math.max(((bucket.medianViews ?? 0) / captionMax) * 100, bucket.count > 0 ? 4 : 1)}%`,
                    }}
                    title={`${captionLabel[bucket.key]} ${t.captionChars} — ${t.reelsUsing(bucket.count)}`}
                  />
                  <span className="text-[10px] text-subtle">{captionLabel[bucket.key]}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-subtle">{t.captionChars}</p>
          </ChartCard>

          {mentions.length > 0 ? (
            <ChartCard title={t.mentions} icon={<Users className="h-4 w-4" />}>
              <div className="flex flex-wrap gap-1.5">
                {mentions.map((mention) => (
                  <span
                    key={mention.tag}
                    title={t.reelsUsing(mention.count)}
                    className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground"
                  >
                    {mention.tag}
                    <span className="ms-1 text-subtle">{mention.count}</span>
                  </span>
                ))}
              </div>
            </ChartCard>
          ) : null}
        </div>
      </div>

      <ChartCard title={t.transcripts} icon={<FileText className="h-4 w-4" />}>
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">
            {t.transcriptsValue(transcripts.ready, transcripts.total)}
            {transcripts.failed > 0 ? (
              <span className="ms-2 text-warning">{t.transcriptsFailed(transcripts.failed)}</span>
            ) : null}
          </span>
          <span className="font-semibold text-foreground">{formatPercent(transcripts.pct, 0)}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-border">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${Math.min(100, transcripts.pct ?? 0)}%` }}
          />
        </div>
      </ChartCard>
    </div>
  );
}
