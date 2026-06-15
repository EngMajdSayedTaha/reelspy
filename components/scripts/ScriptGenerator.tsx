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
  "Spotting the viral pattern…",
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

const VIRAL_PATTERNS = [
  "Hot Take",
  "Mistake List",
  "Tool Reveal",
  "Before/After",
  "Story",
  "Step-by-Step",
  "Unpopular Opinion",
] as const;

const PLATFORMS = ["Instagram Reels", "LinkedIn", "TikTok"] as const;
const TONES = ["Casual", "Direct", "Educational"] as const;

type GeneratedScript = {
  hook: string;
  body: string;
  cta: string;
  viral_pattern: string;
};

type GeneratedResponse = {
  script: GeneratedScript;
  explanation?: string | null;
  error?: string;
};

type ScriptGeneratorProps = {
  reelId?: string;
  initialCaption?: string;
};

export function ScriptGenerator({ reelId, initialCaption = "" }: ScriptGeneratorProps) {
  const [caption, setCaption] = useState(initialCaption);
  const [viralPattern, setViralPattern] = useState<string>("Tool Reveal");
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
        body: JSON.stringify({
          reel_id: reelId,
          caption,
          viral_pattern: viralPattern,
          platform,
          tone,
          custom_context: customContext || undefined,
        }),
      });

      setResult(json);
      toast.success("Script generated");
    } catch (error) {
      setError(notifyError(error, "Failed to generate script."));
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[#1f1f1f] bg-[#111111] p-4 text-zinc-100">
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

          <div className="border-t border-[#1f1f1f]" />

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

          {/* Viral Pattern */}
          <div className="space-y-2">
            <Label>Viral Pattern</Label>
            <div className="flex flex-wrap gap-2">
              {VIRAL_PATTERNS.map((pattern) => (
                <button
                  key={pattern}
                  type="button"
                  onClick={() => setViralPattern(pattern)}
                  className={`rounded-md border px-3 py-1.5 text-sm transition ${
                    viralPattern === pattern
                      ? "border-[#F9E400] bg-[#F9E400]/10 text-[#F9E400]"
                      : "border-zinc-700 text-zinc-300 hover:border-zinc-500"
                  }`}
                >
                  {pattern}
                </button>
              ))}
            </div>
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
                        ? "border-[#F9E400] bg-[#F9E400]/10 text-[#F9E400]"
                        : "border-zinc-700 text-zinc-300 hover:border-zinc-500"
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
                        ? "border-[#F9E400] bg-[#F9E400]/10 text-[#F9E400]"
                        : "border-zinc-700 text-zinc-300 hover:border-zinc-500"
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
              <span className="text-xs text-zinc-500">(optional — add your angle or topic)</span>
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
        <ScriptOutput script={result.script} explanation={result.explanation} />
      ) : null}
    </div>
  );
}
