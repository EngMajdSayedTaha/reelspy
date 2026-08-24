"use client";

import { useMemo, useState } from "react";
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Clock,
  Globe,
  Heart,
  ImageIcon,
  Lock,
  MessageCircle,
  Repeat2,
  Send as SendIcon,
  ThumbsUp,
} from "lucide-react";
import { PLATFORM_ICONS } from "@/components/publishing/platform-icons";
import { PLATFORM_CAPS } from "@/lib/publishing/capabilities";
import { PLATFORM_LABELS, type Platform } from "@/lib/publishing/types";
import { useDict, useLocale } from "@/lib/i18n/I18nProvider";
import { intlLocale } from "@/lib/i18n/intl";
import type { Locale } from "@/lib/i18n/config";
import type { ComposerMedia } from "./composer-media";

type PublishPreviewProps = {
  media: ComposerMedia[];
  title: string;
  caption: string;
  hashtags: string;
  selected: Platform[];
  perPlatform: boolean;
  platformCaptions: Partial<Record<Platform, string>>;
  privacy: "public" | "private";
  /** Which platforms can post publicly; pre-audit TikTok/YouTube are false. */
  publicAllowed?: Record<Platform, boolean>;
  scheduled: boolean;
  scheduledAt: string;
  handle?: string;
};

// Per-platform chrome. `ratio` is how that platform actually frames media, so
// the preview crops the way the platform will: Instagram's feed is 4:5, its
// reels and TikTok are 9:16, YouTube is 16:9.
const CHROME: Record<
  Platform,
  { accent: string; ratio: string; showsTitle: boolean; actions: "instagram" | "facebook" | "tiktok" | "youtube" | "threads" }
> = {
  instagram: { accent: "text-accent-brand", ratio: "aspect-[4/5]", showsTitle: false, actions: "instagram" },
  facebook: { accent: "text-info", ratio: "aspect-square", showsTitle: true, actions: "facebook" },
  tiktok: { accent: "text-foreground", ratio: "aspect-[9/16]", showsTitle: false, actions: "tiktok" },
  youtube: { accent: "text-danger", ratio: "aspect-video", showsTitle: true, actions: "youtube" },
  threads: { accent: "text-foreground", ratio: "aspect-[4/5]", showsTitle: false, actions: "threads" },
};

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
          <span key={i} className="text-info">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function ActionRow({ kind }: { kind: (typeof CHROME)[Platform]["actions"] }) {
  if (kind === "youtube") {
    return (
      <div className="flex items-center gap-4 px-3 pt-2.5 text-muted-foreground">
        <ThumbsUp className="h-4 w-4" />
        <MessageCircle className="h-4 w-4" />
        <SendIcon className="ms-auto h-4 w-4" />
      </div>
    );
  }
  if (kind === "threads") {
    return (
      <div className="flex items-center gap-4 px-3 pt-2.5 text-foreground">
        <Heart className="h-5 w-5" />
        <MessageCircle className="h-5 w-5" />
        <Repeat2 className="h-5 w-5" />
        <SendIcon className="h-5 w-5" />
      </div>
    );
  }
  if (kind === "facebook") {
    return (
      <div className="flex items-center gap-4 px-3 pt-2.5 text-muted-foreground">
        <ThumbsUp className="h-4 w-4" />
        <MessageCircle className="h-4 w-4" />
        <SendIcon className="h-4 w-4" />
      </div>
    );
  }
  return (
    <div className="flex items-center gap-4 px-3 pt-2.5 text-foreground">
      <Heart className="h-5 w-5" />
      <MessageCircle className="h-5 w-5" />
      <SendIcon className="h-5 w-5" />
      {kind === "instagram" ? <Bookmark className="ms-auto h-5 w-5" /> : null}
    </div>
  );
}

export function PublishPreview({
  media,
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

  // Which platform's chrome + caption to mirror. The user can pin one via the
  // switcher; otherwise (or once it leaves the selection) we fall back to the
  // first selected platform — all derived during render, no effect needed.
  const [pinnedPlatform, setPinnedPlatform] = useState<Platform | null>(null);
  const platform =
    pinnedPlatform && selected.includes(pinnedPlatform) ? pinnedPlatform : selected[0] ?? null;

  // Clamped during render, not corrected in an effect: removing the slide you
  // were looking at should show a neighbour on the same frame, not an empty
  // preview followed by a re-render.
  const [rawSlide, setSlide] = useState(0);
  const slide = Math.min(rawSlide, Math.max(0, media.length - 1));

  const chrome = platform ? CHROME[platform] : null;
  const current = media[slide] ?? null;

  // Effective caption mirrors the dispatcher: per-platform override wins, else
  // the shared caption; hashtags are appended the way buildCaption() joins them.
  const fullCaption = useMemo(() => {
    const override = platform && perPlatform ? platformCaptions[platform]?.trim() : "";
    const base = override ? override : caption.trim();
    return [base, hashtags.trim()].filter(Boolean).join("\n\n");
  }, [platform, perPlatform, platformCaptions, caption, hashtags]);

  // Platforms fold long captions behind a "more" link; show where that lands.
  const fold = platform ? Math.min(PLATFORM_CAPS[platform].captionMax, 125) : 125;
  const folded = [...fullCaption].length > fold;
  const visibleCaption = folded ? [...fullCaption].slice(0, fold).join("") : fullCaption;

  const showTitle = Boolean(chrome?.showsTitle && title.trim());

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
          <span className={`text-xs font-medium ${CHROME[platform].accent}`}>
            {PLATFORM_LABELS[platform]}
          </span>
        ) : null}
      </div>

      {/* Platform switcher — flip the preview between the platforms you selected. */}
      {selected.length > 1 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((p) => {
            const Icon = PLATFORM_ICONS[p];
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPinnedPlatform(p)}
                className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                  p === platform
                    ? "border-accent-brand bg-accent-brand/10 text-accent-brand"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3 w-3" />
                {PLATFORM_LABELS[p]}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Phone mockup */}
      <div className="mx-auto w-full max-w-[320px]">
        <div className="rounded-[2.6rem] border-[10px] border-border-strong bg-border-strong shadow-2xl">
          <div className="relative overflow-hidden rounded-[1.9rem] bg-card">
            {/* Notch */}
            <div className="pointer-events-none absolute left-1/2 top-0 z-10 h-5 w-28 -translate-x-1/2 rounded-b-2xl bg-border-strong" />

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

            {/* Media, framed the way this platform frames it */}
            <div className={`relative w-full bg-black ${chrome?.ratio ?? "aspect-[9/16]"}`}>
              {current ? (
                current.kind === "video" ? (
                  <video
                    key={current.id}
                    src={current.objectUrl}
                    className="h-full w-full object-cover"
                    autoPlay
                    muted
                    loop
                    playsInline
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={current.id}
                    src={current.objectUrl}
                    alt={current.altText || ""}
                    className="h-full w-full object-cover"
                  />
                )
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-neutral-500">
                  <ImageIcon className="h-8 w-8" />
                  <span className="text-xs">{dict.videoPlaceholder}</span>
                </div>
              )}

              {/* Carousel controls + dots */}
              {media.length > 1 ? (
                <>
                  <button
                    type="button"
                    aria-label={dict.previewPrevious}
                    onClick={() => setSlide((s) => (s - 1 + media.length) % media.length)}
                    className="absolute start-1 top-1/2 -translate-y-1/2 rounded-full bg-black/45 p-1 text-white transition hover:bg-black/70"
                  >
                    <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
                  </button>
                  <button
                    type="button"
                    aria-label={dict.previewNext}
                    onClick={() => setSlide((s) => (s + 1) % media.length)}
                    className="absolute end-1 top-1/2 -translate-y-1/2 rounded-full bg-black/45 p-1 text-white transition hover:bg-black/70"
                  >
                    <ChevronRight className="h-4 w-4 rtl:rotate-180" />
                  </button>
                  <span className="absolute end-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white">
                    {slide + 1}/{media.length}
                  </span>
                  <div className="absolute inset-x-0 bottom-2 flex items-center justify-center gap-1">
                    {media.map((item, index) => (
                      <span
                        key={item.id}
                        className={`h-1.5 rounded-full transition-all ${
                          index === slide ? "w-3 bg-white" : "w-1.5 bg-white/45"
                        }`}
                      />
                    ))}
                  </div>
                </>
              ) : null}
            </div>

            <ActionRow kind={chrome?.actions ?? "instagram"} />

            {/* Caption */}
            <div className="max-h-44 space-y-1.5 overflow-y-auto px-3 pb-3 pt-2">
              {showTitle ? (
                <p className="text-sm font-semibold leading-snug text-foreground">{title.trim()}</p>
              ) : null}
              {fullCaption ? (
                <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground">
                  <span className="font-semibold">{handle}</span>{" "}
                  <CaptionBody text={visibleCaption} />
                  {folded ? (
                    <span className="text-muted-foreground">… {dict.previewMore}</span>
                  ) : null}
                </p>
              ) : (
                <p className="text-xs italic text-muted-foreground">
                  {dict.previewCaptionPlaceholder}
                </p>
              )}

              {/* Meta: visibility + timing, reflecting the form beside it. */}
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
