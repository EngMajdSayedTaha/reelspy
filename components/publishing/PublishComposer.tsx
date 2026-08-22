"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Eye, EyeOff, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { notifyError } from "@/lib/utils/api";
import { PLATFORMS, PLATFORM_LABELS, type Platform, type TikTokPostOptions } from "@/lib/publishing/types";
import { mediaKindFor } from "@/lib/publishing/capabilities";
import { platformAcceptsMedia, validateDraft } from "@/lib/publishing/validate";
import { probeFile, uploadMediaFile } from "@/lib/publishing/upload-client";
import { createPublishPost } from "@/app/dashboard/publishing/actions";
import { useDict } from "@/lib/i18n/I18nProvider";
import { MediaDropzone } from "./MediaDropzone";
import { PlatformTargets } from "./PlatformTargets";
import { CaptionEditor } from "./CaptionEditor";
import { ScheduleField } from "./ScheduleField";
import { ValidationSummary } from "./ValidationSummary";
import { PublishPreview } from "./PublishPreview";
import {
  TIKTOK_DEFAULTS,
  TikTokPanel,
  tiktokBrandedBlocked,
  type TikTokPanelState,
} from "./TikTokPanel";
import { toDraftMedia, type ComposerMedia } from "./composer-media";

type Props = {
  connected: Record<Platform, boolean>;
  /** Handles shown on each platform card, when we know them. */
  handles?: Partial<Record<Platform, string | null>>;
  /** Account handle shown in the live preview (e.g. "your_account"). */
  handle?: string;
  /**
   * Whether each platform can post publicly. TikTok/YouTube are false until
   * their app audit passes (server reads *_ALLOW_PUBLIC).
   */
  publicAllowed?: Record<Platform, boolean>;
};

const DEFAULT_PUBLIC_ALLOWED: Record<Platform, boolean> = {
  instagram: true,
  facebook: true,
  tiktok: false,
  youtube: false,
  threads: true,
};

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function PublishComposer({
  connected,
  handles = {},
  handle = "your_account",
  publicAllowed = DEFAULT_PUBLIC_ALLOWED,
}: Props) {
  const router = useRouter();
  const dict = useDict();
  const t = dict.publishing;

  const [media, setMedia] = useState<ComposerMedia[]>([]);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [privacy, setPrivacy] = useState<"public" | "private">("public");
  const [scheduled, setScheduled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [selected, setSelected] = useState<Set<Platform>>(new Set());
  const [perPlatform, setPerPlatform] = useState(false);
  const [platformCaptions, setPlatformCaptions] = useState<Partial<Record<Platform, string>>>({});
  const [rawCoverIndex, setCoverIndex] = useState(0);
  const [coverMs, setCoverMs] = useState<number | null>(null);
  const [showMobilePreview, setShowMobilePreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tiktok, setTiktok] = useState<TikTokPanelState>(TIKTOK_DEFAULTS);
  const [tiktokReady, setTiktokReady] = useState(false);

  // Object URLs are created per file and must be released, or a long composing
  // session leaks every preview it ever made. The ref is written in an effect
  // (never during render) so the unmount cleanup can see the final list.
  const mediaRef = useRef<ComposerMedia[]>([]);
  useEffect(() => {
    mediaRef.current = media;
  }, [media]);
  useEffect(() => {
    return () => {
      for (const item of mediaRef.current) URL.revokeObjectURL(item.objectUrl);
    };
  }, []);

  const anyConnected = PLATFORMS.some((p) => connected[p]);

  const draftMedia = useMemo(() => media.map(toDraftMedia), [media]);

  // A platform that simply cannot post this SHAPE (a photo to YouTube) is
  // dropped from the targets here, during render, rather than being pruned out
  // of state by an effect — so it comes back on its own the moment the media
  // changes back, and there's never a frame where the card says selected while
  // the validator disagrees. Fixable problems (too many slides, a caption over
  // the limit) deliberately stay selected so the validation summary can say what
  // to do about them.
  const selectedList = useMemo(
    () => PLATFORMS.filter((p) => selected.has(p) && platformAcceptsMedia(p, draftMedia)),
    [selected, draftMedia]
  );
  const tiktokSelected = selected.has("tiktok");
  const isPhotoPost = media.length > 0 && media.every((m) => m.kind === "image");
  const hasVideo = media.some((m) => m.kind === "video");
  const mediaKind = media.length > 0 ? mediaKindFor(media) : "video";

  // The composer's copy of the exact validation the server action re-runs.
  const validation = useMemo(
    () =>
      validateDraft({
        media: draftMedia,
        platforms: selectedList,
        title,
        caption,
        hashtags,
        captions: platformCaptions,
        scheduledAt: scheduled && scheduledAt ? new Date(scheduledAt).toISOString() : null,
      }),
    [draftMedia, selectedList, title, caption, hashtags, platformCaptions, scheduled, scheduledAt]
  );

  // Platforms still locked to private by their pending app audit.
  const preAuditLocked = PLATFORMS.filter((p) => !publicAllowed[p]);
  const selectedForcedPrivate =
    privacy === "public" ? selectedList.filter((p) => !publicAllowed[p]) : [];

  // Clamped during render: removing slides shouldn't leave the cover pointing
  // past the end for a frame.
  const coverIndex = Math.min(rawCoverIndex, Math.max(0, media.length - 1));

  // ── Media handling ─────────────────────────────────────────────────────────

  async function startUpload(id: string, file: File) {
    setMedia((prev) =>
      prev.map((m) => (m.id === id ? { ...m, status: "uploading", progress: 0, error: null } : m))
    );
    try {
      const result = await uploadMediaFile(file, (percent) => {
        setMedia((prev) => prev.map((m) => (m.id === id ? { ...m, progress: percent } : m)));
      });
      setMedia((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, status: "done", progress: 100, path: result.path } : m
        )
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMedia((prev) =>
        prev.map((m) => (m.id === id ? { ...m, status: "error", error: message } : m))
      );
    }
  }

  async function handleAdd(files: File[]) {
    // Upload starts the moment a file is picked, so by the time the user has
    // written a caption the media is usually already in R2 and "Post now" is
    // instant. The old flow uploaded on submit and made the user wait twice.
    for (const file of files) {
      const probed = await probeFile(file);
      if (!probed) {
        toast.error(t.unsupportedFile(file.name));
        continue;
      }
      const id = newId();
      const item: ComposerMedia = {
        id,
        file,
        kind: probed.kind,
        mimeType: probed.mimeType,
        bytes: probed.bytes,
        width: probed.width,
        height: probed.height,
        durationSeconds: probed.durationSeconds,
        altText: "",
        objectUrl: URL.createObjectURL(file),
        status: "pending",
        progress: 0,
        path: null,
        error: null,
      };
      setMedia((prev) => [...prev, item]);
      void startUpload(id, file);
    }
  }

  function handleRemove(id: string) {
    setMedia((prev) => {
      const item = prev.find((m) => m.id === id);
      if (item) URL.revokeObjectURL(item.objectUrl);
      return prev.filter((m) => m.id !== id);
    });
  }

  function handleReorder(from: number, to: number) {
    setMedia((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    // Keep the cover pinned to the same slide it was on.
    setCoverIndex((prev) => {
      if (prev === from) return to;
      if (from < prev && to >= prev) return prev - 1;
      if (from > prev && to <= prev) return prev + 1;
      return prev;
    });
  }

  function toggle(platform: Platform) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) next.delete(platform);
      else next.add(platform);
      return next;
    });
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  const uploading = media.filter((m) => m.status === "uploading" || m.status === "pending").length;
  const uploadFailed = media.some((m) => m.status === "error");
  const blocked =
    busy ||
    !anyConnected ||
    media.length === 0 ||
    uploading > 0 ||
    uploadFailed ||
    validation.errors.length > 0;

  function resetComposer() {
    for (const item of media) URL.revokeObjectURL(item.objectUrl);
    setMedia([]);
    setTitle("");
    setCaption("");
    setHashtags("");
    setSelected(new Set());
    setPerPlatform(false);
    setPlatformCaptions({});
    setScheduled(false);
    setScheduledAt("");
    setCoverIndex(0);
    setCoverMs(null);
    setTiktok(TIKTOK_DEFAULTS);
    setTiktokReady(false);
  }

  async function handleSubmit() {
    if (media.length === 0) {
      toast.error(t.chooseMediaFirst);
      return;
    }
    if (selected.size === 0) {
      toast.error(t.selectPlatformFirst);
      return;
    }
    if (scheduled && !scheduledAt) {
      toast.error(t.pickDateTimeSchedule);
      return;
    }
    if (validation.errors.length > 0) {
      toast.error(t.validation.message(validation.errors[0]));
      return;
    }
    if (tiktokSelected) {
      if (!tiktokReady) {
        toast.error(t.tiktokSettings.loading);
        return;
      }
      if (!tiktok.confirmed) {
        toast.error(t.tiktokSettings.confirmRequiredError);
        return;
      }
      if (tiktokBrandedBlocked(tiktok, publicAllowed.tiktok)) {
        toast.error(
          !publicAllowed.tiktok
            ? t.tiktokSettings.brandedNeedsAuditWarning
            : t.tiktokSettings.brandedPrivacyWarning
        );
        return;
      }
    }

    const uploaded = media.filter((m) => m.status === "done" && m.path);
    if (uploaded.length !== media.length) {
      toast.error(t.uploadingLabel);
      return;
    }

    setBusy(true);
    try {
      // Only forward per-platform captions when the toggle is on, and only for
      // platforms actually selected with non-blank copy.
      const captions: Record<string, string> = {};
      if (perPlatform) {
        for (const platform of selectedList) {
          const value = platformCaptions[platform]?.trim();
          if (value) captions[platform] = value;
        }
      }

      const tiktokOptions: TikTokPostOptions | undefined = tiktokSelected
        ? {
            // Draft mode ignores privacy/disclosure server-side (the creator
            // sets them inside TikTok), so SELF_ONLY here is just a valid
            // placeholder satisfying the type, not a real choice.
            privacyLevel:
              tiktok.postMode === "draft"
                ? "SELF_ONLY"
                : (tiktok.privacyLevel as TikTokPostOptions["privacyLevel"]),
            postMode: tiktok.postMode,
            brandedContent: tiktok.postMode === "direct" && tiktok.brandedContent,
            brandOrganic: tiktok.postMode === "direct" && tiktok.brandOrganic,
            autoAddMusic: tiktok.autoAddMusic,
          }
        : undefined;

      const result = await createPublishPost({
        media: uploaded.map((m) => ({
          path: m.path!,
          kind: m.kind,
          mimeType: m.mimeType,
          bytes: m.bytes,
          width: m.width,
          height: m.height,
          durationSeconds: m.durationSeconds,
          altText: m.altText.trim() || null,
        })),
        title: title.trim() || null,
        caption: caption.trim() || null,
        hashtags: hashtags.trim() || null,
        platforms: selectedList,
        captions: Object.keys(captions).length > 0 ? captions : undefined,
        privacy,
        coverIndex,
        coverMs,
        scheduledAt: scheduled && scheduledAt ? new Date(scheduledAt).toISOString() : null,
        tiktokOptions,
      });

      toast.success(result.publishedNow ? t.publishStarted : t.scheduledSuccessToast);
      resetComposer();
      router.refresh();
    } catch (error) {
      notifyError(error, t.publishFallbackError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_300px] md:items-start lg:grid-cols-[minmax(0,1fr)_340px]">
      <div data-tour="publish-composer" className="space-y-5 rounded-2xl border border-border bg-card p-5">
        <MediaDropzone
          items={media}
          onAdd={handleAdd}
          onRemove={handleRemove}
          onReorder={handleReorder}
          onAltText={(id, altText) =>
            setMedia((prev) => prev.map((m) => (m.id === id ? { ...m, altText } : m)))
          }
          onRetry={(id) => {
            const item = media.find((m) => m.id === id);
            if (item) void startUpload(id, item.file);
          }}
          coverIndex={mediaKind === "carousel" && isPhotoPost ? coverIndex : null}
          onCoverIndex={setCoverIndex}
          disabled={busy}
        />

        {/* Instagram's thumb_offset — only meaningful for a single reel. */}
        {mediaKind === "video" && hasVideo && selected.has("instagram") ? (
          <CoverFramePicker
            objectUrl={media[0]?.objectUrl ?? null}
            valueMs={coverMs}
            onChange={setCoverMs}
          />
        ) : null}

        <CaptionEditor
          title={title}
          onTitle={setTitle}
          hashtags={hashtags}
          onHashtags={setHashtags}
          caption={caption}
          onCaption={setCaption}
          perPlatform={perPlatform}
          onPerPlatform={setPerPlatform}
          platformCaptions={platformCaptions}
          onPlatformCaption={(platform, value) =>
            setPlatformCaptions((prev) => ({ ...prev, [platform]: value }))
          }
          selected={selectedList}
        />

        <PlatformTargets
          connected={connected}
          handles={handles}
          selected={selected}
          onToggle={toggle}
          media={media}
        />

        {tiktokSelected && connected.tiktok ? (
          <TikTokPanel
            state={tiktok}
            onChange={(patch) => setTiktok((prev) => ({ ...prev, ...patch }))}
            publicAllowed={publicAllowed.tiktok}
            isPhotoPost={isPhotoPost}
            onInfo={(info) => setTiktokReady(Boolean(info))}
          />
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="pub-privacy">{t.visibilityLabel}</Label>
            <select
              id="pub-privacy"
              value={privacy}
              onChange={(e) => setPrivacy(e.target.value as "public" | "private")}
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-base md:text-sm"
            >
              <option value="public">{t.visibilityPublic}</option>
              <option value="private">{t.visibilityPrivate}</option>
            </select>
            {selectedForcedPrivate.length > 0 ? (
              <p className="text-xs text-warning">
                {t.forcedPrivateWarning(
                  selectedForcedPrivate.map((p) => PLATFORM_LABELS[p]).join(t.andConnector),
                  selectedForcedPrivate.length > 1
                )}
              </p>
            ) : preAuditLocked.length > 0 ? (
              <p className="text-xs text-subtle">
                {t.preAuditHint(preAuditLocked.map((p) => PLATFORM_LABELS[p]).join(t.andConnector))}
              </p>
            ) : null}
          </div>

          <ScheduleField
            enabled={scheduled}
            onEnabled={setScheduled}
            value={scheduledAt}
            onValue={setScheduledAt}
          />
        </div>

        <ValidationSummary
          errors={validation.errors}
          warnings={validation.warnings}
          ready={media.length > 0 && selected.size > 0}
        />

        <Button type="button" onClick={handleSubmit} disabled={blocked} className="w-full sm:w-auto">
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> {t.workingButton}
            </>
          ) : uploading > 0 ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />{" "}
              {t.uploadingButton(media.length - uploading, media.length)}
            </>
          ) : scheduled ? (
            <>
              <CalendarClock className="h-4 w-4" /> {t.schedulePostButton}
            </>
          ) : (
            <>
              <Send className="h-4 w-4" /> {t.postNowButton}
            </>
          )}
        </Button>
      </div>

      {/* Live social-media preview — a side column on tablet & desktop, an
          opt-in disclosure below the composer on phones. */}
      <div data-tour="publish-preview">
        <button
          type="button"
          onClick={() => setShowMobilePreview((v) => !v)}
          aria-expanded={showMobilePreview}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-border-strong bg-surface-2 px-3 py-2 text-sm font-medium text-muted-foreground transition hover:border-accent-brand/60 hover:text-accent-brand md:hidden"
        >
          {showMobilePreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {showMobilePreview ? t.hidePreview : t.showPreview}
        </button>
        <div className={`mt-4 md:mt-0 ${showMobilePreview ? "block" : "hidden"} md:block`}>
          <PublishPreview
            media={media}
            title={title}
            caption={caption}
            hashtags={hashtags}
            selected={selectedList}
            perPlatform={perPlatform}
            platformCaptions={platformCaptions}
            privacy={privacy}
            publicAllowed={publicAllowed}
            scheduled={scheduled}
            scheduledAt={scheduledAt}
            handle={handle}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Instagram's `thumb_offset`: which frame of a reel becomes the thumbnail.
 * Scrubbing a muted <video> is the only way to pick one without uploading and
 * re-downloading the file, so the picker is just the video plus a range input.
 */
function CoverFramePicker({
  objectUrl,
  valueMs,
  onChange,
}: {
  objectUrl: string | null;
  valueMs: number | null;
  onChange: (ms: number | null) => void;
}) {
  const t = useDict().publishing;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);

  if (!objectUrl) return null;

  return (
    <div className="space-y-2 rounded-xl border border-border bg-background p-4">
      <Label>{t.coverFrameLabel}</Label>
      <p className="text-xs text-subtle">{t.coverFrameHint}</p>
      <div className="flex items-center gap-3">
        <video
          ref={videoRef}
          src={objectUrl}
          muted
          playsInline
          preload="metadata"
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
          className="h-20 w-20 shrink-0 rounded-lg bg-black object-cover"
        />
        <div className="min-w-0 flex-1 space-y-1.5">
          <input
            type="range"
            min={0}
            max={Math.max(0, Math.floor(duration * 1000))}
            step={100}
            value={valueMs ?? 0}
            onChange={(e) => {
              const ms = Number(e.target.value);
              onChange(ms > 0 ? ms : null);
              if (videoRef.current) videoRef.current.currentTime = ms / 1000;
            }}
            className="w-full"
            aria-label={t.coverFrameLabel}
          />
          <p className="text-[11px] text-muted-foreground">
            {valueMs ? `${(valueMs / 1000).toFixed(1)}s` : t.coverFrameCleared}
          </p>
        </div>
      </div>
    </div>
  );
}
