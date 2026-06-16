"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Eye,
  Heart,
  MessageCircle,
  Flame,
  Play,
  ExternalLink,
  Sparkles,
  Check,
  Captions,
  ThumbsDown,
  RotateCcw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FavoriteButton } from "@/components/reels/FavoriteButton";

type Reel = {
  id: string;
  caption: string | null;
  ig_permalink: string;
  thumbnail_url: string | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  viral_score: number | null;
  is_worked_on: boolean | null;
  posted_at: string | null;
  transcript_status: string | null;
  viral_pattern: string | null;
  is_discarded: boolean | null;
  is_favorite: boolean | null;
  inspiration_accounts:
    | { ig_username: string; display_name: string | null; avatar_url: string | null }
    | { ig_username: string; display_name: string | null; avatar_url: string | null }[]
    | null;
};

type ReelRowProps = {
  reel: Reel;
  markWorkedAction: (formData: FormData) => Promise<void>;
  discardAction: (formData: FormData) => Promise<void>;
  favoriteAction: (formData: FormData) => Promise<void>;
};

function getSource(reel: Reel) {
  const acc = Array.isArray(reel.inspiration_accounts)
    ? reel.inspiration_accounts[0]
    : reel.inspiration_accounts;
  return { username: acc?.ig_username ?? "unknown" };
}

function formatCompact(value: number | null): string {
  const n = value ?? 0;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}K`;
  return new Intl.NumberFormat("en-US").format(n);
}

function toEmbedUrl(permalink: string): string {
  const base = permalink.endsWith("/") ? permalink : `${permalink}/`;
  return `${base}embed`;
}

export function ReelRow({
  reel,
  markWorkedAction,
  discardAction,
  favoriteAction,
}: ReelRowProps) {
  const { username } = getSource(reel);
  const [playing, setPlaying] = useState(false);
  const [imgError, setImgError] = useState(false);

  const postedLabel = reel.posted_at
    ? new Date(reel.posted_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <article className="group flex gap-4 rounded-xl border border-border bg-card p-3 text-foreground transition hover:border-border-strong">
      {/* Thumbnail (tap to play inline) */}
      <div className="relative aspect-[4/5] w-24 shrink-0 overflow-hidden rounded-lg bg-background sm:w-28">
        {playing ? (
          <iframe
            src={toEmbedUrl(reel.ig_permalink)}
            title={`Reel by @${username}`}
            className="absolute inset-0 h-full w-full"
            loading="lazy"
            allow="encrypted-media; clipboard-write"
            scrolling="no"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label="Play reel inline"
            className="absolute inset-0"
          >
            {reel.thumbnail_url && !imgError ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={reel.thumbnail_url}
                alt={reel.caption ?? `Reel by @${username}`}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-secondary to-background">
                <Play className="h-6 w-6 text-subtle" />
              </div>
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition group-hover:opacity-100">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/30 backdrop-blur-sm">
                <Play className="ml-0.5 h-4 w-4 fill-current" />
              </span>
            </span>
          </button>
        )}
        <div className="absolute left-1 top-1 z-10">
          <FavoriteButton
            reelId={reel.id}
            favorite={Boolean(reel.is_favorite)}
            action={favoriteAction}
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <a
              href={`https://www.instagram.com/${username}/`}
              target="_blank"
              rel="noreferrer"
              className="truncate text-sm font-medium text-foreground hover:text-brand"
            >
              @{username}
            </a>
            {postedLabel ? (
              <span className="ml-2 text-xs text-subtle">{postedLabel}</span>
            ) : null}
          </div>
          <Badge
            variant={reel.is_worked_on ? "default" : "outline"}
            className={reel.is_worked_on ? "bg-primary text-black" : ""}
          >
            {reel.is_worked_on ? "Worked On" : "New"}
          </Badge>
        </div>

        <p className="line-clamp-2 break-words text-sm text-muted-foreground">
          {reel.caption ?? "No caption available."}
        </p>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Eye className="h-3.5 w-3.5" /> {formatCompact(reel.view_count)}
          </span>
          <span className="flex items-center gap-1">
            <Heart className="h-3.5 w-3.5" /> {formatCompact(reel.like_count)}
          </span>
          <span className="flex items-center gap-1">
            <MessageCircle className="h-3.5 w-3.5" /> {formatCompact(reel.comment_count)}
          </span>
          <span className="flex items-center gap-1 font-medium text-brand">
            <Flame className="h-3.5 w-3.5" /> {formatCompact(reel.viral_score)}
          </span>
          {reel.viral_pattern ? (
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-medium text-brand">
              {reel.viral_pattern}
            </span>
          ) : null}
          {reel.transcript_status === "ready" ? (
            <span className="flex items-center gap-1 text-brand" title="Transcript available">
              <Captions className="h-3.5 w-3.5" /> Transcript
            </span>
          ) : null}
        </div>

        {/* Actions */}
        <div className="mt-auto flex items-center gap-2 pt-1">
          <Button asChild size="sm">
            <Link href={`/dashboard/generate/${reel.id}`}>
              <Sparkles className="mr-1.5 h-4 w-4" />
              Script
            </Link>
          </Button>

          <form action={markWorkedAction}>
            <input type="hidden" name="reel_id" value={reel.id} />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={Boolean(reel.is_worked_on)}
              title={reel.is_worked_on ? "Already marked" : "Mark as worked on"}
            >
              <Check className="h-4 w-4" />
            </Button>
          </form>

          <form action={discardAction}>
            <input type="hidden" name="reel_id" value={reel.id} />
            <input type="hidden" name="discarded" value={reel.is_discarded ? "false" : "true"} />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              title={reel.is_discarded ? "Restore reel" : "Discard (don't show again)"}
              aria-label={reel.is_discarded ? "Restore reel" : "Discard reel"}
            >
              {reel.is_discarded ? (
                <RotateCcw className="h-4 w-4" />
              ) : (
                <ThumbsDown className="h-4 w-4" />
              )}
            </Button>
          </form>

          <Button asChild size="sm" variant="outline">
            <a
              href={reel.ig_permalink}
              target="_blank"
              rel="noreferrer"
              title="Open in Instagram"
              aria-label="Open in Instagram"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>
    </article>
  );
}
