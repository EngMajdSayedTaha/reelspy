"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Send, CalendarClock, Loader2, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { notifyError, requestJson } from "@/lib/utils/api";
import { PLATFORMS, PLATFORM_LABELS, type Platform, type TikTokPostOptions } from "@/lib/publishing/types";
import { PublishPreview } from "@/components/publishing/PublishPreview";
import { createPublishPost } from "@/app/dashboard/publishing/actions";
import { useDict } from "@/lib/i18n/I18nProvider";

type TikTokCreatorInfo = {
  creatorAvatarUrl: string | null;
  creatorUsername: string | null;
  creatorNickname: string | null;
  privacyLevelOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSec: number | null;
};

type Props = {
  connected: Record<Platform, boolean>;
  /** Account handle shown in the live preview (e.g. "your_account"). */
  handle?: string;
  /**
   * Whether each platform can post publicly. TikTok/YouTube are false until
   * their app audit passes (server reads *_ALLOW_PUBLIC). Defaults keep IG/FB
   * public and the pre-audit platforms private-only.
   */
  publicAllowed?: Record<Platform, boolean>;
};

const ACCEPT = "video/mp4,video/quicktime,video/webm";

const DEFAULT_PUBLIC_ALLOWED: Record<Platform, boolean> = {
  instagram: true,
  facebook: true,
  tiktok: false,
  youtube: false,
};

export function PublishComposer({
  connected,
  handle = "your_account",
  publicAllowed = DEFAULT_PUBLIC_ALLOWED,
}: Props) {
  const router = useRouter();
  const dict = useDict();
  const t = dict.publishing;
  const fileInput = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [privacy, setPrivacy] = useState<"public" | "private">("public");
  const [scheduled, setScheduled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [selected, setSelected] = useState<Set<Platform>>(new Set());
  // Per-platform caption overrides. Off by default: every platform uses the
  // shared caption above. When on, each selected platform gets its own box and
  // anything left blank still falls back to the shared caption.
  const [perPlatform, setPerPlatform] = useState(false);
  // Phones hide the side-by-side preview column; this toggles it inline instead.
  const [showMobilePreview, setShowMobilePreview] = useState(false);
  const [platformCaptions, setPlatformCaptions] = useState<Record<Platform, string>>({
    instagram: "",
    facebook: "",
    tiktok: "",
    youtube: "",
  });
  const [busy, setBusy] = useState(false);

  // TikTok compliance panel (T4) — draft-vs-direct, real privacy options fetched
  // live from creator_info/query, disclosure toggles, and the required Music
  // Usage / Terms confirmation. Only relevant once TikTok is selected.
  const [tiktokInfo, setTiktokInfo] = useState<TikTokCreatorInfo | null>(null);
  const [tiktokInfoLoading, setTiktokInfoLoading] = useState(false);
  const [tiktokInfoError, setTiktokInfoError] = useState<string | null>(null);
  const [tiktokPostMode, setTiktokPostMode] = useState<"direct" | "draft">("direct");
  const [tiktokPrivacyLevel, setTiktokPrivacyLevel] = useState("");
  const [tiktokBrandedContent, setTiktokBrandedContent] = useState(false);
  const [tiktokBrandOrganic, setTiktokBrandOrganic] = useState(false);
  const [tiktokConfirmed, setTiktokConfirmed] = useState(false);

  const anyConnected = PLATFORMS.some((p) => connected[p]);

  // Platforms still locked to private by their pending app audit (server flag).
  const preAuditLocked = PLATFORMS.filter((p) => !publicAllowed[p]);
  // Of the platforms actually selected, which will be forced private despite a
  // "public" choice — the honest, per-selection version of the audit warning.
  const selectedForcedPrivate =
    privacy === "public" ? Array.from(selected).filter((p) => !publicAllowed[p]) : [];

  function toggle(platform: Platform) {
    if (!connected[platform]) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) next.delete(platform);
      else next.add(platform);
      return next;
    });
  }

  const tiktokSelected = selected.has("tiktok");

  // Fetch the creator's real account info (avatar/nickname + privacy_level
  // options) once TikTok is selected and connected — never a hardcoded
  // privacy list per TikTok's UX guidelines. Fetched at most once per mount;
  // re-fetch if it previously failed and the panel is shown again.
  useEffect(() => {
    if (!tiktokSelected || !connected.tiktok) return;
    if (tiktokInfo || tiktokInfoLoading) return;

    let cancelled = false;
    setTiktokInfoLoading(true);
    setTiktokInfoError(null);
    requestJson<TikTokCreatorInfo>("/api/publishing/tiktok/creator-info")
      .then((info) => {
        if (cancelled) return;
        setTiktokInfo(info);
        setTiktokPrivacyLevel((prev) => prev || info.privacyLevelOptions[0] || "SELF_ONLY");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setTiktokInfoError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) setTiktokInfoLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiktokSelected, connected.tiktok]);

  // The client-side mirror of the server guard in actions.ts: branded content
  // can't post privately, and until the app audit passes every TikTok direct
  // post is forced private regardless of the chosen level.
  const tiktokBrandedBlocked =
    tiktokBrandedContent &&
    tiktokPostMode === "direct" &&
    (tiktokPrivacyLevel === "SELF_ONLY" || !publicAllowed.tiktok);

  // Upload the file straight to Cloudflare R2 via a one-time presigned PUT URL,
  // returning the object path the post will reference. The bytes go directly to
  // R2 (no server hop, no Supabase 50 MB cap), which is what fixes the 413.
  async function uploadVideo(video: File): Promise<string> {
    const contentType = video.type || "video/mp4";
    const { path, uploadUrl } = await requestJson<{ path: string; uploadUrl: string }>(
      "/api/publishing/upload",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType, fileName: video.name }),
      }
    );

    // Content-Type isn't part of the presigned signature (host-only), so this is
    // just stored as the object's content type on R2.
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: video,
    });
    if (!res.ok) {
      throw new Error(t.uploadFailed(res.status));
    }
    return path;
  }

  async function handleSubmit() {
    if (!file) {
      toast.error(t.chooseVideoFirst);
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
    if (tiktokSelected) {
      if (tiktokInfoLoading || !tiktokInfo) {
        toast.error(t.tiktokSettings.loading);
        return;
      }
      if (!tiktokConfirmed) {
        toast.error(t.tiktokSettings.confirmRequiredError);
        return;
      }
      if (tiktokBrandedBlocked) {
        toast.error(
          !publicAllowed.tiktok ? t.tiktokSettings.brandedNeedsAuditWarning : t.tiktokSettings.brandedPrivacyWarning
        );
        return;
      }
    }

    setBusy(true);
    try {
      const videoPath = await uploadVideo(file);
      // Only forward per-platform captions when the toggle is on, and only for
      // platforms actually selected with non-blank copy.
      const captions: Record<string, string> = {};
      if (perPlatform) {
        for (const platform of selected) {
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
              tiktokPostMode === "draft"
                ? "SELF_ONLY"
                : (tiktokPrivacyLevel as TikTokPostOptions["privacyLevel"]),
            postMode: tiktokPostMode,
            brandedContent: tiktokPostMode === "direct" && tiktokBrandedContent,
            brandOrganic: tiktokPostMode === "direct" && tiktokBrandOrganic,
          }
        : undefined;

      const result = await createPublishPost({
        videoPath,
        title: title.trim() || null,
        caption: caption.trim() || null,
        hashtags: hashtags.trim() || null,
        platforms: Array.from(selected),
        captions: Object.keys(captions).length > 0 ? captions : undefined,
        privacy,
        scheduledAt: scheduled && scheduledAt ? new Date(scheduledAt).toISOString() : null,
        tiktokOptions,
      });

      if (result.publishedNow) {
        toast.success(t.publishStarted);
      } else {
        toast.success(t.scheduledSuccessToast);
      }

      // Reset and refresh the history.
      setFile(null);
      setTitle("");
      setCaption("");
      setHashtags("");
      setSelected(new Set());
      setPerPlatform(false);
      setPlatformCaptions({ instagram: "", facebook: "", tiktok: "", youtube: "" });
      setScheduled(false);
      setScheduledAt("");
      setTiktokPostMode("direct");
      setTiktokBrandedContent(false);
      setTiktokBrandOrganic(false);
      setTiktokConfirmed(false);
      if (fileInput.current) fileInput.current.value = "";
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
      {/* Upload */}
      <div className="space-y-2">
        <Label>{t.videoLabel}</Label>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="flex w-full items-center gap-3 rounded-lg border border-dashed border-border-strong bg-background px-4 py-6 text-start transition hover:border-primary"
        >
          {file ? (
            <CheckCircle2 className="h-5 w-5 text-success" />
          ) : (
            <Upload className="h-5 w-5 text-muted-foreground" />
          )}
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-foreground">
              {file ? file.name : t.chooseVideo}
            </span>
            <span className="block text-xs text-muted-foreground">{t.videoFormats}</span>
          </span>
        </button>
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>

      {/* Caption */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="pub-title">{t.titleLabel}</Label>
          <Input
            id="pub-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t.optionalTitlePlaceholder}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pub-hashtags">{t.hashtagsLabel}</Label>
          <Input
            id="pub-hashtags"
            value={hashtags}
            onChange={(e) => setHashtags(e.target.value)}
            placeholder={t.hashtagsPlaceholder}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="pub-caption">{t.captionLabel}</Label>
        <Textarea
          id="pub-caption"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder={t.captionPlaceholder}
          rows={3}
        />
      </div>

      {/* Platforms */}
      <div className="space-y-2">
        <Label>{t.postToLabel}</Label>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((platform) => {
            const isConn = connected[platform];
            const isOn = selected.has(platform);
            return (
              <button
                key={platform}
                type="button"
                disabled={!isConn}
                onClick={() => toggle(platform)}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                  isOn
                    ? "border-accent-brand bg-accent-brand/10 text-accent-brand"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                } disabled:cursor-not-allowed disabled:opacity-40`}
                title={isConn ? "" : t.connectFirstHint}
              >
                {PLATFORM_LABELS[platform]}
                {!isConn ? t.notConnectedSuffix : ""}
              </button>
            );
          })}
        </div>
        {!anyConnected ? (
          <p className="text-xs text-warning">{t.connectAtLeastOne}</p>
        ) : null}
      </div>

      {/* TikTok compliance panel — draft-vs-direct, real privacy options,
          disclosure toggles, creator identity, Music Usage/Terms confirmation. */}
      {tiktokSelected && connected.tiktok ? (
        <div className="space-y-3 rounded-xl border border-border bg-background p-4">
          <Label>{t.tiktokSettings.heading}</Label>

          {tiktokInfoLoading ? (
            <p className="flex items-center gap-2 text-xs text-subtle">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t.tiktokSettings.loading}
            </p>
          ) : tiktokInfoError ? (
            <p className="text-xs text-danger">{t.tiktokSettings.loadFailed(tiktokInfoError)}</p>
          ) : tiktokInfo ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm">
                {tiktokInfo.creatorAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={tiktokInfo.creatorAvatarUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-border-strong"
                  />
                ) : (
                  <span className="h-8 w-8 shrink-0 rounded-full bg-secondary ring-1 ring-border-strong" />
                )}
                <span className="text-muted-foreground">
                  {t.tiktokSettings.postingAsPrefix}{" "}
                  <span className="font-medium text-foreground">
                    {tiktokInfo.creatorNickname ?? tiktokInfo.creatorUsername ?? "—"}
                  </span>
                </span>
              </div>

              <div className="space-y-2">
                <Label>{t.tiktokSettings.postModeLabel}</Label>
                <div className="flex flex-col gap-1.5">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="tiktok-post-mode"
                      checked={tiktokPostMode === "direct"}
                      onChange={() => setTiktokPostMode("direct")}
                    />
                    {t.tiktokSettings.postModeDirect}
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="tiktok-post-mode"
                      checked={tiktokPostMode === "draft"}
                      onChange={() => setTiktokPostMode("draft")}
                    />
                    {t.tiktokSettings.postModeDraft}
                  </label>
                  {tiktokPostMode === "draft" ? (
                    <p className="text-xs text-subtle">{t.tiktokSettings.postModeDraftHint}</p>
                  ) : null}
                </div>
              </div>

              {tiktokPostMode === "direct" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="pub-tiktok-privacy">{t.tiktokSettings.privacyLevelLabel}</Label>
                    <select
                      id="pub-tiktok-privacy"
                      value={tiktokPrivacyLevel}
                      onChange={(e) => setTiktokPrivacyLevel(e.target.value)}
                      className="h-9 w-full rounded-lg border border-border bg-background px-3 text-base md:text-sm"
                    >
                      {tiktokInfo.privacyLevelOptions.map((level) => (
                        <option key={level} value={level}>
                          {t.tiktokSettings.privacyLevelLabelFor(level)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>{t.tiktokSettings.disclosureLabel}</Label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={tiktokBrandedContent}
                        onChange={(e) => setTiktokBrandedContent(e.target.checked)}
                      />
                      {t.tiktokSettings.brandedContentLabel}
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={tiktokBrandOrganic}
                        onChange={(e) => setTiktokBrandOrganic(e.target.checked)}
                      />
                      {t.tiktokSettings.brandOrganicLabel}
                    </label>
                    {tiktokBrandedBlocked ? (
                      <p className="text-xs text-warning">
                        {!publicAllowed.tiktok
                          ? t.tiktokSettings.brandedNeedsAuditWarning
                          : t.tiktokSettings.brandedPrivacyWarning}
                      </p>
                    ) : null}
                  </div>
                </>
              ) : null}

              <label className="flex items-start gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={tiktokConfirmed}
                  onChange={(e) => setTiktokConfirmed(e.target.checked)}
                />
                <span>
                  {t.tiktokSettings.confirmBefore}
                  <a
                    href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en"
                    target="_blank"
                    rel="noreferrer"
                    className="underline hover:text-foreground"
                  >
                    {t.tiktokSettings.musicUsageLink}
                  </a>
                  {t.tiktokSettings.confirmMiddle}
                  <a
                    href="https://www.tiktok.com/legal/page/global/terms-of-service/en"
                    target="_blank"
                    rel="noreferrer"
                    className="underline hover:text-foreground"
                  >
                    {t.tiktokSettings.termsOfServiceLink}
                  </a>
                  {t.tiktokSettings.confirmAfter}
                </span>
              </label>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Per-platform captions */}
      <div className="space-y-3 rounded-xl border border-border bg-background p-4">
        <Label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={perPlatform}
            onChange={(e) => setPerPlatform(e.target.checked)}
          />
          {t.customizeCaptionPerPlatform}
        </Label>
        {!perPlatform ? (
          <p className="text-xs text-subtle">{t.perPlatformOffHint}</p>
        ) : selected.size === 0 ? (
          <p className="text-xs text-warning">{t.selectPlatformToCustomize}</p>
        ) : (
          <div className="space-y-3">
            {Array.from(selected).map((platform) => (
              <div key={platform} className="space-y-1.5">
                <Label htmlFor={`pub-caption-${platform}`} className="text-xs">
                  {t.platformCaptionLabel(PLATFORM_LABELS[platform])}
                </Label>
                <Textarea
                  id={`pub-caption-${platform}`}
                  value={platformCaptions[platform]}
                  onChange={(e) =>
                    setPlatformCaptions((prev) => ({ ...prev, [platform]: e.target.value }))
                  }
                  placeholder={
                    caption.trim()
                      ? t.leaveBlankPlaceholder
                      : t.captionForPlatformPlaceholder(PLATFORM_LABELS[platform])
                  }
                  rows={2}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Privacy + scheduling */}
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
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={scheduled}
              onChange={(e) => setScheduled(e.target.checked)}
            />
            {t.scheduleForLater}
          </Label>
          {scheduled ? (
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          ) : (
            <p className="text-xs text-subtle">{t.leaveOffHint}</p>
          )}
        </div>
      </div>

      <Button type="button" onClick={handleSubmit} disabled={busy || !anyConnected} className="w-full sm:w-auto">
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> {t.workingButton}
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
            file={file}
            title={title}
            caption={caption}
            hashtags={hashtags}
            selected={Array.from(selected)}
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
