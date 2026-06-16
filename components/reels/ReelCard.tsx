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
  is_discarded: boolean | null;
  is_favorite: boolean | null;
  inspiration_accounts:
    | { ig_username: string; display_name: string | null; avatar_url: string | null }
    | { ig_username: string; display_name: string | null; avatar_url: string | null }[]
    | null;
};

type ReelCardProps = {
  reel: Reel;
  markWorkedAction: (formData: FormData) => Promise<void>;
  discardAction: (formData: FormData) => Promise<void>;
  favoriteAction: (formData: FormData) => Promise<void>;
};

function getSource(reel: Reel) {
  const acc = Array.isArray(reel.inspiration_accounts)
    ? reel.inspiration_accounts[0]
    : reel.inspiration_accounts;
  return {
    username: acc?.ig_username ?? "unknown",
    avatar: acc?.avatar_url ?? null,
  };
}

function formatCompact(value: number | null): string {
  const n = value ?? 0;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}K`;
  return new Intl.NumberFormat("en-US").format(n);
}

// Instagram embed URL from a reel/post permalink.
function toEmbedUrl(permalink: string): string {
  const base = permalink.endsWith("/") ? permalink : `${permalink}/`;
  return `${base}embed`;
}

function Metric({
  icon,
  value,
  label,
  accent,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5" title={label}>
      <span className={accent ? "text-brand" : "text-subtle"}>{icon}</span>
      <span className={accent ? "font-semibold text-brand" : "font-medium text-foreground"}>
        {value}
      </span>
    </div>
  );
}

export function ReelCard({
  reel,
  markWorkedAction,
  discardAction,
  favoriteAction,
}: ReelCardProps) {
  const { username, avatar } = getSource(reel);
  const [playing, setPlaying] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  const postedLabel = reel.posted_at
    ? new Date(reel.posted_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-foreground transition duration-200 hover:-translate-y-1 hover:border-border-strong hover:shadow-xl hover:shadow-black/40">
      {/* Media */}
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-background">
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
          <>
            {reel.thumbnail_url && !imgError ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={reel.thumbnail_url}
                alt={reel.caption ?? `Reel by @${username}`}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-secondary to-background">
                <Play className="h-10 w-10 text-subtle" />
              </div>
            )}

            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/30" />

            {/* Play to embed */}
            <button
              type="button"
              onClick={() => setPlaying(true)}
              aria-label="Play reel inline"
              className="absolute inset-0 flex items-center justify-center"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/30 backdrop-blur-sm transition group-hover:scale-110 group-hover:bg-primary group-hover:text-black">
                <Play className="ml-0.5 h-6 w-6 fill-current" />
              </span>
            </button>

            {/* Favorite toggle */}
            <div className="absolute left-2 top-2 z-10">
              <FavoriteButton
                reelId={reel.id}
                favorite={Boolean(reel.is_favorite)}
                action={favoriteAction}
              />
            </div>

            {/* Status badge */}
            <div className="absolute right-2 top-2">
              <Badge
                variant={reel.is_worked_on ? "default" : "outline"}
                className={
                  reel.is_worked_on
                    ? "bg-primary text-black"
                    : "border-white/20 bg-black/50 text-white backdrop-blur-sm"
                }
              >
                {reel.is_worked_on ? "Worked On" : "New"}
              </Badge>
            </div>

            {/* Views overlay (most relevant reel metric) */}
            <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
              <Eye className="h-3.5 w-3.5" />
              {formatCompact(reel.view_count)} views
            </div>

            {/* Transcript indicator */}
            {reel.transcript_status === "ready" ? (
              <div
                className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-xs font-medium text-brand backdrop-blur-sm"
                title="Transcript available"
              >
                <Captions className="h-3.5 w-3.5" />
                Transcript
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        {/* Source */}
        <div className="flex items-center justify-between gap-2">
          <a
            href={`https://www.instagram.com/${username}/`}
            target="_blank"
            rel="noreferrer"
            className="flex min-w-0 items-center gap-2"
          >
            {avatar && !avatarError ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatar}
                alt={`@${username}`}
                referrerPolicy="no-referrer"
                onError={() => setAvatarError(true)}
                className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-border-strong"
              />
            ) : (
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-border text-xs font-semibold text-muted-foreground ring-1 ring-border-strong">
                {username.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="truncate text-sm font-medium text-foreground hover:text-foreground">
              @{username}
            </span>
          </a>

          {postedLabel ? (
            <span className="shrink-0 text-xs text-subtle">{postedLabel}</span>
          ) : null}
        </div>

        {/* Caption */}
        <p className="line-clamp-2 min-h-[2.5rem] break-words text-sm text-muted-foreground">
          {reel.caption ?? "No caption available."}
        </p>

        {/* Metrics */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
          <Metric icon={<Heart className="h-4 w-4" />} value={formatCompact(reel.like_count)} label="Likes" />
          <Metric
            icon={<MessageCircle className="h-4 w-4" />}
            value={formatCompact(reel.comment_count)}
            label="Comments"
          />
          <Metric
            icon={<Flame className="h-4 w-4" />}
            value={formatCompact(reel.viral_score)}
            label="Viral score"
            accent
          />
        </div>

        {/* Actions */}
        <div className="mt-auto flex items-center gap-2 pt-1">
          <Button asChild size="sm" className="flex-1">
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
