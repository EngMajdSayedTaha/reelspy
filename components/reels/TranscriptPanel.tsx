"use client";

import { useState } from "react";
import { FileText, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type TranscriptStatus = "none" | "pending" | "ready" | "failed";

type TranscriptPanelProps = {
  reelId: string;
  initialTranscript: string | null;
  initialStatus: TranscriptStatus;
  initialSource: string | null;
  initialLanguage: string | null;
};

type TranscriptResponse = {
  transcript?: string | null;
  status?: TranscriptStatus;
  source?: string | null;
  language?: string | null;
  cached?: boolean;
  error?: string;
};

export function TranscriptPanel({
  reelId,
  initialTranscript,
  initialStatus,
  initialSource,
  initialLanguage,
}: TranscriptPanelProps) {
  const [transcript, setTranscript] = useState<string | null>(initialTranscript);
  const [status, setStatus] = useState<TranscriptStatus>(initialStatus);
  const [source, setSource] = useState<string | null>(initialSource);
  const [language, setLanguage] = useState<string | null>(initialLanguage);
  const [isLoading, setIsLoading] = useState(false);

  const hasTranscript = Boolean(transcript && status === "ready");

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
    <div className="rounded-xl border border-[#1f1f1f] bg-[#111111] p-4 text-sm text-zinc-300">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-[#F9E400]" />
          <p className="font-medium text-zinc-100">Reel Transcript</p>
          {hasTranscript && source ? (
            <span className="truncate text-xs text-zinc-500">
              via {source}
              {language ? ` · ${language}` : ""}
            </span>
          ) : null}
        </div>

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

      {hasTranscript ? (
        <div className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-[#1f1f1f] bg-[#0a0a0a] p-3 leading-relaxed text-zinc-200">
          {transcript}
        </div>
      ) : status === "failed" ? (
        <p className="mt-3 text-zinc-500">
          Transcript unavailable for this reel. Make sure a transcription provider is configured, then try again.
        </p>
      ) : (
        <p className="mt-3 text-zinc-500">
          Generate the spoken transcript of this reel to study its hook, pacing, and structure.
        </p>
      )}
    </div>
  );
}
