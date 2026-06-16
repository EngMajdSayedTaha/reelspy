"use client";

import { useState } from "react";
import { Check, Copy, Download, FileText, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { AiThinking } from "@/components/ui/ai-thinking";
import { Button } from "@/components/ui/button";

const TRANSCRIPT_LOADING_MESSAGES = [
  "Fetching the reel…",
  "Listening to the audio…",
  "Writing down every word…",
  "Catching the hook and pacing…",
  "Cleaning up the text…",
  "Almost there…",
];

type TranscriptStatus = "none" | "pending" | "ready" | "failed";

type TranscriptPanelProps = {
  reelId: string;
  initialTranscript: string | null;
  initialSrt: string | null;
  initialStatus: TranscriptStatus;
  initialSource: string | null;
  initialLanguage: string | null;
};

type TranscriptResponse = {
  transcript?: string | null;
  srt?: string | null;
  status?: TranscriptStatus;
  source?: string | null;
  language?: string | null;
  cached?: boolean;
  error?: string;
};

export function TranscriptPanel({
  reelId,
  initialTranscript,
  initialSrt,
  initialStatus,
  initialSource,
  initialLanguage,
}: TranscriptPanelProps) {
  const [transcript, setTranscript] = useState<string | null>(initialTranscript);
  const [srt, setSrt] = useState<string | null>(initialSrt);
  const [status, setStatus] = useState<TranscriptStatus>(initialStatus);
  const [source, setSource] = useState<string | null>(initialSource);
  const [language, setLanguage] = useState<string | null>(initialLanguage);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const hasTranscript = Boolean(transcript && status === "ready");
  const hasSrt = Boolean(srt && status === "ready");

  const copyTranscript = async () => {
    if (!transcript) return;
    try {
      await navigator.clipboard.writeText(transcript);
      setCopied(true);
      toast.success("Transcript copied.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy transcript.");
    }
  };

  const downloadSrt = () => {
    if (!srt) return;
    try {
      const blob = new Blob([srt], { type: "application/x-subrip;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `reel-${reelId}.srt`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("Downloaded .srt file.");
    } catch {
      toast.error("Could not download the .srt file.");
    }
  };

  const generate = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/reels/${reelId}/transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: hasTranscript }),
      });
      const json = (await response.json()) as TranscriptResponse;

      if (!response.ok || json.error) {
        setStatus("failed");
        toast.error(json.error ?? "Could not generate transcript.");
        return;
      }

      setTranscript(json.transcript ?? null);
      setSrt(json.srt ?? null);
      setStatus(json.status ?? "ready");
      setSource(json.source ?? null);
      setLanguage(json.language ?? null);
      toast.success(json.cached ? "Loaded saved transcript." : "Transcript ready.");
    } catch {
      setStatus("failed");
      toast.error("Could not generate transcript.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-brand" />
          <p className="font-medium text-foreground">Reel Transcript</p>
          {hasTranscript && source ? (
            <span className="truncate text-xs text-subtle">
              AI transcription{language ? ` · ${language}` : ""}
            </span>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {hasTranscript && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={copyTranscript}
              className="shrink-0"
            >
              {copied ? (
                <Check className="h-4 w-4 text-emerald-400" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              {copied ? "Copied!" : "Copy"}
            </Button>
          )}

          {hasSrt && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={downloadSrt}
              className="shrink-0"
              title="Download timed captions (.srt) matching the audio"
            >
              <Download className="h-4 w-4" />
              .srt
            </Button>
          )}

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={generate}
            disabled={isLoading}
            className="shrink-0"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : hasTranscript ? (
              <RefreshCw className="h-4 w-4" />
            ) : null}
            {isLoading ? "Transcribing…" : hasTranscript ? "Regenerate" : "Generate transcript"}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <AiThinking messages={TRANSCRIPT_LOADING_MESSAGES} className="mt-3" />
      ) : hasTranscript ? (
        <div className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-background p-3 leading-relaxed text-foreground">
          {transcript}
        </div>
      ) : status === "failed" ? (
        <p className="mt-3 text-subtle">
          We couldn&apos;t transcribe this reel. It may be private, very long, or temporarily
          unavailable — try again in a bit.
        </p>
      ) : (
        <p className="mt-3 text-subtle">
          Generate the spoken transcript of this reel to study its hook, pacing, and structure.
          You can copy the text or download timed captions as an .srt file that matches the audio.
        </p>
      )}
    </div>
  );
}
