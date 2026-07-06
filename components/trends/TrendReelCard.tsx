"use client";

import { ExternalLink, Eye, Heart, MessageCircle, TrendingUp } from "lucide-react";
import { TrackAccountButton } from "@/components/trends/TrackAccountButton";
import type { TrendReel } from "@/lib/trends/shared";
import { useDict } from "@/lib/i18n/I18nProvider";
import type { Dict } from "@/lib/i18n/dictionaries";

// Compact count (1.2K / 3.4M) for the metric row.
function compact(n: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

function daysAgo(iso: string | null, dict: Dict["trends"]["card"]): string {
  if (!iso) return "";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d <= 0) return dict.today;
  return dict.daysAgo(d);
}

type Props = {
  reel: TrendReel;
  niche?: string;
  alreadyTracked: boolean;
};

// One cross-user trend reel (X3). Anonymized — shows the PUBLIC account + public
// metrics only, never who tracks it. The outperform badge is the size-controlled
// signal (beats the account's own median), so a small niche account can top a
// big one.
export function TrendReelCard({ reel, niche, alreadyTracked }: Props) {
  const fullDict = useDict();
  const dict = fullDict.trends.card;
  const outperform = reel.outperformRatio >= 1.5 ? `×${reel.outperformRatio.toFixed(1)}` : null;

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <div className="relative aspect-[9/16] max-h-72 w-full bg-secondary/40">
        {reel.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={reel.thumbnailUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-subtle">
            {dict.noThumbnail}
          </div>
        )}
        {outperform ? (
          <span
            className="absolute start-2 top-2 inline-flex items-center gap-1 rounded-full bg-success px-2 py-1 text-xs font-semibold text-primary-foreground shadow"
            title={dict.outperformTitle(reel.igUsername, outperform)}
          >
            <TrendingUp className="h-3.5 w-3.5" /> {outperform}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">@{reel.igUsername}</p>
          <p className="text-xs text-subtle">
            {reel.followers != null ? `${compact(reel.followers)} ${dict.followers}` : "—"}
            {reel.postedAt ? ` · ${daysAgo(reel.postedAt, dict)}` : ""}
          </p>
        </div>

        {reel.caption ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">{reel.caption}</p>
        ) : null}

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Eye className="h-3.5 w-3.5" /> {compact(reel.viewCount)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Heart className="h-3.5 w-3.5" /> {compact(reel.likeCount)}
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageCircle className="h-3.5 w-3.5" /> {compact(reel.commentCount)}
          </span>
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <TrackAccountButton
            username={reel.igUsername}
            niche={niche}
            initialTracked={alreadyTracked}
          />
          {reel.permalink ? (
            <a
              href={reel.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-brand"
            >
              {fullDict.common.view} <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
