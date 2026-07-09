"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ScriptOutput } from "@/components/scripts/ScriptOutput";
import { AiThinking } from "@/components/ui/ai-thinking";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { notifyError, requestJson } from "@/lib/utils/api";
import { useDict } from "@/lib/i18n/I18nProvider";

const PLATFORMS = ["Instagram Reels", "LinkedIn", "TikTok"] as const;
const TONES = ["Casual", "Direct", "Educational"] as const;

type GeneratedScript = {
  hook: string;
  body: string;
  cta: string;
};

type GeneratedResponse = {
  script: GeneratedScript;
  degraded?: boolean;
  /** True when the script was grounded on the reel's transcript (W1), false
   *  when only the caption was available. */
  grounded?: boolean;
  error?: string;
};

type TranscriptStatus = "none" | "pending" | "ready" | "failed";

type ScriptGeneratorProps = {
  reelId?: string;
  initialCaption?: string;
  /** Pre-fills the custom-context box — e.g. a saved hook sent over from the
   *  Hook Library "Use in script" action (W4). */
  initialContext?: string;
  /** The source reel's transcript state, so we can warn upfront (before
   *  generating) when grounding will be degraded to caption-only (W1/B7). */
  transcriptStatus?: TranscriptStatus | null;
};

export function ScriptGenerator({
  reelId,
  initialCaption = "",
  initialContext = "",
  transcriptStatus,
}: ScriptGeneratorProps) {
  const dict = useDict();
  const s = dict.scripts;

  // Upfront note shown before generating when a tracked reel has no usable
  // transcript — so the user knows the script won't be grounded on the audio.
  const DEGRADED_HINTS: Record<Exclude<TranscriptStatus, "ready">, string> = {
    failed: s.degradedHintFailed,
    pending: s.degradedHintPending,
    none: s.degradedHintNone,
  };

  const [caption, setCaption] = useState(initialCaption);
  const [platform, setPlatform] = useState<string>("Instagram Reels");
  const [tone, setTone] = useState<string>("Direct");
  const [customContext, setCustomContext] = useState(initialContext);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GeneratedResponse | null>(null);

  // External reel link → transcript
  const [reelUrl, setReelUrl] = useState("");
  const [isFetchingReel, setIsFetchingReel] = useState(false);
  const [reelFetchError, setReelFetchError] = useState<string | null>(null);

  // W1: one-tap "transcribe this reel first, then regenerate" when the last
  // script came back caption-only. Only reachable for a tracked reel (reelId).
  const [isTranscribing, setIsTranscribing] = useState(false);

  const onFetchReel = async () => {
    const url = reelUrl.trim();
    if (!url) return;
    setIsFetchingReel(true);
    setReelFetchError(null);

    try {
      const json = await requestJson<{ transcript: string }>("/api/ig/reel-from-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      setCaption(json.transcript);
      toast.success(s.transcriptLoaded);
    } catch (err) {
      setReelFetchError(err instanceof Error ? err.message : s.couldNotFetchReel);
    } finally {
      setIsFetchingReel(false);
    }
  };

  const onGenerate = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const json = await requestJson<GeneratedResponse>("/api/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Above the server's ~60s AI budget so this only trips if the request
        // itself wedges — the spinner can never hang forever.
        timeoutMs: 70_000,
        body: JSON.stringify({
          reel_id: reelId,
          caption,
          platform,
          tone,
          custom_context: customContext || undefined,
        }),
      });

      setResult(json);
      if (json.degraded) {
        toast.warning(s.aiUnavailable);
      } else {
        toast.success(s.scriptGenerated);
      }
    } catch (error) {
      setError(notifyError(error, s.failedToGenerate));
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  };

  const onTranscribeAndGenerate = async () => {
    if (!reelId) return;
    setIsTranscribing(true);
    setError(null);

    try {
      // Runs the full yt-dlp + Whisper pipeline server-side (minutes), so allow
      // a budget above its 300s maxDuration before the client gives up.
      await requestJson(`/api/reels/${reelId}/transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        timeoutMs: 300_000,
        body: JSON.stringify({}),
      });
      toast.success(s.transcriptReadyRegenerating);
      await onGenerate();
    } catch (err) {
      setError(notifyError(err, s.couldNotTranscribe));
    } finally {
      setIsTranscribing(false);
    }
  };

  return (
    <div className="space-y-5">
      <div data-tour="script-generator" className="rounded-xl border border-border bg-card p-4 text-foreground">
        <div className="space-y-4">
          {/* External reel link → transcript */}
          <div data-tour="transcribe-link" className="space-y-2">
            <Label>{s.transcribeFromLink}</Label>
            <div className="flex gap-2">
              <Input
                placeholder="https://www.instagram.com/reel/..."
                value={reelUrl}
                onChange={(e) => setReelUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onFetchReel();
                  }
                }}
                disabled={isFetchingReel}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                onClick={onFetchReel}
                disabled={isFetchingReel || !reelUrl.trim()}
                className="shrink-0"
              >
                {isFetchingReel ? s.transcribing : s.transcribe}
              </Button>
            </div>

            {reelFetchError ? (
              <p className="text-sm text-danger">{reelFetchError}</p>
            ) : null}

            {isFetchingReel ? <AiThinking messages={s.reelFetchMessages} /> : null}
          </div>

          <div className="border-t border-border" />

          {/* Caption context */}
          <div className="space-y-2">
            <Label htmlFor="caption">{s.captionLabel}</Label>
            <Textarea
              id="caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder={s.captionPlaceholder}
              rows={3}
              className="resize-none"
            />
          </div>

          {/* Platform + Tone row */}
          <div data-tour="platform-tone" className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{s.platformLabel}</Label>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPlatform(p)}
                    className={`rounded-md border px-3 py-1.5 text-sm transition ${
                      platform === p
                        ? "border-primary bg-primary/10 text-brand"
                        : "border-border-strong text-muted-foreground hover:border-border-strong"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>{s.toneLabel}</Label>
              <div className="flex flex-wrap gap-2">
                {TONES.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setTone(opt)}
                    className={`rounded-md border px-3 py-1.5 text-sm transition ${
                      tone === opt
                        ? "border-primary bg-primary/10 text-brand"
                        : "border-border-strong text-muted-foreground hover:border-border-strong"
                    }`}
                  >
                    {s.tones[opt]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Custom context */}
          <div className="space-y-2">
            <Label htmlFor="custom-context">
              {s.customContextLabel}{" "}
              <span className="text-xs text-subtle">{s.customContextHint}</span>
            </Label>
            <Textarea
              id="custom-context"
              value={customContext}
              onChange={(e) => setCustomContext(e.target.value)}
              placeholder={s.customContextPlaceholder}
              rows={2}
              className="resize-none"
            />
          </div>

          {reelId && transcriptStatus && transcriptStatus !== "ready" ? (
            <p
              className={
                transcriptStatus === "failed"
                  ? "rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning"
                  : "rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
              }
            >
              {DEGRADED_HINTS[transcriptStatus]}
            </p>
          ) : null}

          <Button
            type="button"
            onClick={onGenerate}
            disabled={isLoading || (!caption && !reelId)}
            className="w-full sm:w-auto"
          >
            {isLoading ? s.generating : s.generate}
          </Button>

          {error ? <p className="text-sm text-danger">{error}</p> : null}

          {isLoading ? <AiThinking messages={s.generatingMessages} /> : null}
        </div>
      </div>

      {result?.script ? (
        <div className="space-y-2">
          {result.degraded ? (
            <p className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning">
              {s.placeholderNotice}
            </p>
          ) : reelId ? (
            <div data-tour="grounded-badge">
              {result.grounded ? (
                <span className="inline-flex w-fit items-center gap-1.5 rounded-md border border-success/30 bg-success/5 px-2.5 py-1 text-xs font-medium text-success">
                  {s.groundedOnTranscript} ✓
                </span>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    {s.captionOnly}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onTranscribeAndGenerate}
                    disabled={isTranscribing || isLoading}
                  >
                    {isTranscribing ? s.transcribing : s.transcribeFirstThenRegenerate}
                  </Button>
                </div>
              )}
            </div>
          ) : null}
          {isTranscribing ? <AiThinking messages={s.reelFetchMessages} /> : null}
          <ScriptOutput script={result.script} />
        </div>
      ) : null}
    </div>
  );
}
