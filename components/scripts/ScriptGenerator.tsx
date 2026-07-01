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

const SCRIPT_LOADING_MESSAGES = [
  "Reading the reel context…",
  "Writing a scroll-stopping hook…",
  "Shaping the script…",
  "Adding a natural call to action…",
];

const REEL_FETCH_MESSAGES = [
  "Fetching reel…",
  "Extracting audio…",
  "Transcribing with Whisper…",
  "Almost done…",
];

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
  error?: string;
};

type ScriptGeneratorProps = {
  reelId?: string;
  initialCaption?: string;
};

export function ScriptGenerator({ reelId, initialCaption = "" }: ScriptGeneratorProps) {
  const [caption, setCaption] = useState(initialCaption);
  const [platform, setPlatform] = useState<string>("Instagram Reels");
  const [tone, setTone] = useState<string>("Direct");
  const [customContext, setCustomContext] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GeneratedResponse | null>(null);

  // External reel link → transcript
  const [reelUrl, setReelUrl] = useState("");
  const [isFetchingReel, setIsFetchingReel] = useState(false);
  const [reelFetchError, setReelFetchError] = useState<string | null>(null);

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
      toast.success("Transcript loaded");
    } catch (err) {
      setReelFetchError(err instanceof Error ? err.message : "Could not fetch reel.");
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
        toast.warning("AI is unavailable right now — showing a placeholder. Try again in a moment.");
      } else {
        toast.success("Script generated");
      }
    } catch (error) {
      setError(notifyError(error, "Failed to generate script."));
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-4 text-foreground">
        <div className="space-y-4">
          {/* External reel link → transcript */}
          <div className="space-y-2">
            <Label>Transcribe from Instagram Link</Label>
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
                {isFetchingReel ? "Transcribing…" : "Transcribe"}
              </Button>
            </div>

            {reelFetchError ? (
              <p className="text-sm text-rose-400">{reelFetchError}</p>
            ) : null}

            {isFetchingReel ? <AiThinking messages={REEL_FETCH_MESSAGES} /> : null}
          </div>

          <div className="border-t border-border" />

          {/* Caption context */}
          <div className="space-y-2">
            <Label htmlFor="caption">Reel Caption / Context</Label>
            <Textarea
              id="caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Paste the inspiration reel caption here..."
              rows={3}
              className="resize-none"
            />
          </div>

          {/* Platform + Tone row */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Platform</Label>
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
              <Label>Tone</Label>
              <div className="flex flex-wrap gap-2">
                {TONES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTone(t)}
                    className={`rounded-md border px-3 py-1.5 text-sm transition ${
                      tone === t
                        ? "border-primary bg-primary/10 text-brand"
                        : "border-border-strong text-muted-foreground hover:border-border-strong"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Custom context */}
          <div className="space-y-2">
            <Label htmlFor="custom-context">
              Custom Context{" "}
              <span className="text-xs text-subtle">(optional — add your angle or topic)</span>
            </Label>
            <Textarea
              id="custom-context"
              value={customContext}
              onChange={(e) => setCustomContext(e.target.value)}
              placeholder="e.g. I want this to be about Angular signals..."
              rows={2}
              className="resize-none"
            />
          </div>

          <Button
            type="button"
            onClick={onGenerate}
            disabled={isLoading || (!caption && !reelId)}
            className="w-full sm:w-auto"
          >
            {isLoading ? "Generating..." : "Generate Script"}
          </Button>

          {error ? <p className="text-sm text-rose-400">{error}</p> : null}

          {isLoading ? <AiThinking messages={SCRIPT_LOADING_MESSAGES} /> : null}
        </div>
      </div>

      {result?.script ? (
        <div className="space-y-2">
          {result.degraded ? (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-300">
              This is a generic placeholder — the AI didn&apos;t respond in time, so no real
              script was generated (and it wasn&apos;t saved). Tap Generate Script again in a
              moment.
            </p>
          ) : null}
          <ScriptOutput script={result.script} />
        </div>
      ) : null}
    </div>
  );
}
