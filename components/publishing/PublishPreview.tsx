"use client";

import { useEffect, useMemo, useState } from "react";
import { Heart, MessageCircle, Send as SendIcon, Bookmark, Film, Globe, Lock, Clock } from "lucide-react";
import { PLATFORM_LABELS, type Platform } from "@/lib/publishing/types";
import { useDict, useLocale } from "@/lib/i18n/I18nProvider";
import { intlLocale } from "@/lib/i18n/intl";
import type { Locale } from "@/lib/i18n/config";

type PublishPreviewProps = {
  file: File | null;
  title: string;
  caption: string;
  hashtags: string;
  selected: Platform[];
  perPlatform: boolean;
  platformCaptions: Record<Platform, string>;
  privacy: "public" | "private";
  /** Which platforms can post publicly; pre-audit TikTok/YouTube are false. */
  publicAllowed?: Record<Platform, boolean>;
  scheduled: boolean;
  scheduledAt: string;
  handle?: string;
};

// Per-platform accent + which platforms treat `title` as part of the post body.
const PLATFORM_ACCENT: Record<Platform, string> = {
  instagram: "text-fuchsia-500",
  facebook: "text-blue-500",
  tiktok: "text-foreground",
  youtube: "text-red-500",
};

const TITLE_PLATFORMS: Platform[] = ["youtube", "facebook"];

function formatSchedule(value: string, locale: Locale): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(intlLocale(locale), {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Render a caption with hashtags tinted, matching how social apps style them.
function CaptionBody({ text }: { text: string }) {
  if (!text) return null;
  const parts = text.split(/(\s+)/);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("#") || part.startsWith("@") ? (
          <span key={i} className="text-sky-500">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

export function PublishPreview({
  file,
  title,
  caption,
  hashtags,
  selected,
  perPlatform,
  platformCaptions,
  privacy,
  publicAllowed,
  scheduled,
  scheduledAt,
  handle = "your_account",
}: PublishPreviewProps) {
  const dict = useDict().publishing;
  const locale = useLocale();
  // Object URL for the chosen video, derived during render and revoked on
  // cleanup (avoids the setState-in-effect cascade).
  const videoUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  // Which platform's chrome + caption to mirror. The user can pin one via the
  // switcher; otherwise (or once it leaves the selection) we fall back to the
  // first selected platform — all derived during render, no effect needed.
  const [pinnedPlatform, setPinnedPlatform] = useState<Platform | null>(null);
  const platform =
    pinnedPlatform && selected.includes(pinnedPlatform) ? pinnedPlatform : selected[0] ?? null;

  // Effective caption mirrors the dispatcher: per-platform override wins, else
  // the shared caption; hashtags are appended the way buildCaption() joins them.
  const fullCaption = useMemo(() => {
    const override = platform && perPlatform ? platformCaptions[platform]?.trim() : "";
    const base = override ? override : caption.trim();
    return [base, hashtags.trim()].filter(Boolean).join("\n\n");
  }, [platform, perPlatform, platformCaptions, caption, hashtags]);

  const showTitle = Boolean(platform && TITLE_PLATFORMS.includes(platform) && title.trim());

  // The shown platform's *effective* visibility: a "public" choice is still
  // forced private when that platform's app audit is pending.
  const forcedPrivate =
    privacy === "public" && platform != null && publicAllowed?.[platform] === false;
  const effectivePublic = privacy === "public" && !forcedPrivate;

  return (
    <div className="sticky top-6 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">{dict.livePreview}</p>
        {platform ? (
          <span className={`text-xs font-medium ${PLATFORM_ACCENT[platform]}`}>
            {PLATFORM_LABELS[platform]}
          </span>
        ) : null}
      </div>

      {/* Platform switcher — flip the preview between the platforms you selected. */}
      {selected.length > 1 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPinnedPlatform(p)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                p === platform
                  ? "border-accent-brand bg-accent-brand/10 text-accent-brand"
                  : "border-border bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              {PLATFORM_LABELS[p]}
            </button>
          ))}
        </div>
      ) : null}

      {/* Phone mockup */}
      <div className="mx-auto w-full max-w-[320px]">
        <div className="rounded-[2.6rem] border-[10px] border-neutral-800 bg-neutral-800 shadow-2xl dark:border-neutral-700">
          <div className="relative overflow-hidden rounded-[1.9rem] bg-card">
            {/* Notch */}
            <div className="pointer-events-none absolute left-1/2 top-0 z-10 h-5 w-28 -translate-x-1/2 rounded-b-2xl bg-neutral-800 dark:bg-neutral-700" />

            {/* Account header */}
            <div className="flex items-center gap-2 px-3 pb-2 pt-6">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-fuchsia-500 via-rose-500 to-amber-400 text-xs font-semibold text-white">
                {handle.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-xs font-semibold text-foreground">{handle}</p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {platform ? PLATFORM_LABELS[platform] : dict.selectPlatform}
                </p>
              </div>
              <span className="text-lg leading-none text-muted-foreground">⋯</span>
            </div>

            {/* Media (9:16) */}
            <div className="relative aspect-[9/16] w-full bg-black">
              {videoUrl ? (
                <video
                  key={videoUrl}
                  src={videoUrl}
                  className="h-full w-full object-cover"
                  autoPlay
                  muted
                  loop
                  playsInline
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-neutral-500">
                  <Film className="h-8 w-8" />
                  <span className="text-xs">{dict.videoPlaceholder}</span>
                </div>
              )}
            </div>

            {/* Action row */}
            <div className="flex items-center gap-4 px-3 pt-2.5 text-foreground">
              <Heart className="h-5 w-5" />
              <MessageCircle className="h-5 w-5" />
              <SendIcon className="h-5 w-5" />
              <Bookmark className="ms-auto h-5 w-5" />
            </div>

            {/* Caption */}
            <div className="max-h-44 space-y-1.5 overflow-y-auto px-3 pb-3 pt-2">
              {showTitle ? (
                <p className="text-sm font-semibold leading-snug text-foreground">{title.trim()}</p>
              ) : null}
              {fullCaption ? (
                <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground">
                  <span className="font-semibold">{handle}</span>{" "}
                  <CaptionBody text={fullCaption} />
                </p>
              ) : (
                <p className="text-xs italic text-muted-foreground">
                  {dict.previewCaptionPlaceholder}
                </p>
              )}

              {/* Meta: visibility + timing, reflecting the form below it. */}
              <div className="flex items-center gap-1.5 pt-1 text-[10px] text-muted-foreground">
                {effectivePublic ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                <span>{effectivePublic ? dict.visibilityPublic : dict.visibilityPrivate}</span>
                {forcedPrivate ? <span className="text-warning">{dict.untilAudit}</span> : null}
                <span>·</span>
                {scheduled && scheduledAt ? (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {formatSchedule(scheduledAt, locale)}
                  </span>
                ) : (
                  <span>{dict.postsImmediately}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
