"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Send, CalendarClock, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { notifyError, requestJson } from "@/lib/utils/api";
import { PLATFORMS, PLATFORM_LABELS, type Platform } from "@/lib/publishing/types";
import { PublishPreview } from "@/components/publishing/PublishPreview";
import { createPublishPost } from "@/app/dashboard/publishing/actions";

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
  const [platformCaptions, setPlatformCaptions] = useState<Record<Platform, string>>({
    instagram: "",
    facebook: "",
    tiktok: "",
    youtube: "",
  });
  const [busy, setBusy] = useState(false);

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
      throw new Error(`Upload failed (${res.status}). Please try again.`);
    }
    return path;
  }

  async function handleSubmit() {
    if (!file) {
      toast.error("Choose a video to upload first.");
      return;
    }
    if (selected.size === 0) {
      toast.error("Select at least one platform.");
      return;
    }
    if (scheduled && !scheduledAt) {
      toast.error("Pick a date and time to schedule.");
      return;
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

      const result = await createPublishPost({
        videoPath,
        title: title.trim() || null,
        caption: caption.trim() || null,
        hashtags: hashtags.trim() || null,
        platforms: Array.from(selected),
        captions: Object.keys(captions).length > 0 ? captions : undefined,
        privacy,
        scheduledAt: scheduled && scheduledAt ? new Date(scheduledAt).toISOString() : null,
      });

      if (result.publishedNow) {
        toast.success("Publishing started — check the history below for status.");
      } else {
        toast.success("Scheduled. It will post automatically at the chosen time.");
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
      if (fileInput.current) fileInput.current.value = "";
      router.refresh();
    } catch (error) {
      notifyError(error, "Could not publish. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_300px] md:items-start lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-5 rounded-2xl border border-border bg-card p-5">
      {/* Upload */}
      <div className="space-y-2">
        <Label>Video</Label>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="flex w-full items-center gap-3 rounded-lg border border-dashed border-border-strong bg-background px-4 py-6 text-left transition hover:border-primary"
        >
          {file ? (
            <CheckCircle2 className="h-5 w-5 text-success" />
          ) : (
            <Upload className="h-5 w-5 text-muted-foreground" />
          )}
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-foreground">
              {file ? file.name : "Click to choose a video"}
            </span>
            <span className="block text-xs text-muted-foreground">MP4, MOV or WebM</span>
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
          <Label htmlFor="pub-title">Title (YouTube / FB)</Label>
          <Input
            id="pub-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Optional title"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pub-hashtags">Hashtags</Label>
          <Input
            id="pub-hashtags"
            value={hashtags}
            onChange={(e) => setHashtags(e.target.value)}
            placeholder="#reels #viral"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="pub-caption">Caption</Label>
        <Textarea
          id="pub-caption"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Write the caption that goes out with the video…"
          rows={3}
        />
      </div>

      {/* Platforms */}
      <div className="space-y-2">
        <Label>Post to</Label>
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
                    ? "border-primary bg-primary/10 text-brand"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                } disabled:cursor-not-allowed disabled:opacity-40`}
                title={isConn ? "" : "Connect this platform first"}
              >
                {PLATFORM_LABELS[platform]}
                {!isConn ? " · not connected" : ""}
              </button>
            );
          })}
        </div>
        {!anyConnected ? (
          <p className="text-xs text-warning">
            Connect at least one platform on the Connections tab to start posting.
          </p>
        ) : null}
      </div>

      {/* Per-platform captions */}
      <div className="space-y-3 rounded-xl border border-border bg-background p-4">
        <Label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={perPlatform}
            onChange={(e) => setPerPlatform(e.target.checked)}
          />
          Customize caption per platform
        </Label>
        {!perPlatform ? (
          <p className="text-xs text-subtle">
            Off — every selected platform uses the shared caption above. Turn on to write a
            tailored caption for each one.
          </p>
        ) : selected.size === 0 ? (
          <p className="text-xs text-warning">Select a platform above to customize its caption.</p>
        ) : (
          <div className="space-y-3">
            {Array.from(selected).map((platform) => (
              <div key={platform} className="space-y-1.5">
                <Label htmlFor={`pub-caption-${platform}`} className="text-xs">
                  {PLATFORM_LABELS[platform]} caption
                </Label>
                <Textarea
                  id={`pub-caption-${platform}`}
                  value={platformCaptions[platform]}
                  onChange={(e) =>
                    setPlatformCaptions((prev) => ({ ...prev, [platform]: e.target.value }))
                  }
                  placeholder={
                    caption.trim()
                      ? `Leave blank to use the shared caption…`
                      : `Caption for ${PLATFORM_LABELS[platform]}…`
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
          <Label htmlFor="pub-privacy">Visibility</Label>
          <select
            id="pub-privacy"
            value={privacy}
            onChange={(e) => setPrivacy(e.target.value as "public" | "private")}
            className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm"
          >
            <option value="public">Public</option>
            <option value="private">Private / unlisted</option>
          </select>
          {selectedForcedPrivate.length > 0 ? (
            <p className="text-xs text-warning">
              {selectedForcedPrivate.map((p) => PLATFORM_LABELS[p]).join(" & ")} will still post
              privately until {selectedForcedPrivate.length > 1 ? "their app audits pass" : "its app audit passes"}.
            </p>
          ) : preAuditLocked.length > 0 ? (
            <p className="text-xs text-subtle">
              {preAuditLocked.map((p) => PLATFORM_LABELS[p]).join(" & ")} stay private until their
              app audit passes.
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
            Schedule for later
          </Label>
          {scheduled ? (
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          ) : (
            <p className="text-xs text-subtle">Leave off to publish immediately.</p>
          )}
        </div>
      </div>

      <Button type="button" onClick={handleSubmit} disabled={busy || !anyConnected} className="w-full sm:w-auto">
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Working…
          </>
        ) : scheduled ? (
          <>
            <CalendarClock className="h-4 w-4" /> Schedule post
          </>
        ) : (
          <>
            <Send className="h-4 w-4" /> Post now
          </>
        )}
      </Button>
      </div>

      {/* Live social-media preview — tablet & desktop only. */}
      <div className="hidden md:block">
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
  );
}
