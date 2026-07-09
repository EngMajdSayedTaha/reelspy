"use client";

import { useState, useTransition } from "react";
import { BookmarkPlus, Check, Copy, Download, FileText, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { AiThinking } from "@/components/ui/ai-thinking";
import { Button } from "@/components/ui/button";
import { extractHook } from "@/lib/utils/hook";
import { saveHook } from "@/app/dashboard/hooks/actions";
import { useDict } from "@/lib/i18n/I18nProvider";

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
  const dict = useDict().feed.transcript;
  const [transcript, setTranscript] = useState<string | null>(initialTranscript);
  const [srt, setSrt] = useState<string | null>(initialSrt);
  const [status, setStatus] = useState<TranscriptStatus>(initialStatus);
  const [source, setSource] = useState<string | null>(initialSource);
  const [language, setLanguage] = useState<string | null>(initialLanguage);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hookSaved, setHookSaved] = useState(false);
  const [savingHook, startSaveHook] = useTransition();

  const hasTranscript = Boolean(transcript && status === "ready");
  const hasSrt = Boolean(srt && status === "ready");

  const copyTranscript = async () => {
    if (!transcript) return;
    try {
      await navigator.clipboard.writeText(transcript);
      setCopied(true);
      toast.success(dict.copiedToast);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(dict.copyError);
    }
  };

  // Save this reel's opening line to the persistent hook library (W4). The hook
  // is the first sentence of the transcript — same derivation the library uses.
  const saveHookFromTranscript = () => {
    const hook = extractHook(transcript);
    if (!hook) {
      toast.error(dict.hookNotFoundError);
      return;
    }
    setHookSaved(true);
    startSaveHook(async () => {
      try {
        await saveHook({ text: hook, reelId, source: "transcript" });
        toast.success(dict.hookSavedToast);
      } catch {
        setHookSaved(false);
        toast.error(dict.hookSaveError);
      }
    });
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
      toast.success(dict.downloadedToast);
    } catch {
      toast.error(dict.downloadError);
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
        toast.error(json.error ?? dict.generateError);
        return;
      }

      setTranscript(json.transcript ?? null);
      setSrt(json.srt ?? null);
      setStatus(json.status ?? "ready");
      setSource(json.source ?? null);
      setLanguage(json.language ?? null);
      toast.success(json.cached ? dict.cachedToast : dict.readyToast);
    } catch {
      setStatus("failed");
      toast.error(dict.generateError);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div data-tour="transcript-panel" className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-brand" />
          <p className="font-medium text-foreground">{dict.heading}</p>
          {hasTranscript && source ? (
            <span className="truncate text-xs text-subtle">
              {dict.aiTranscriptionLabel(language)}
            </span>
          ) : null}
        </div>

        <div data-tour="transcript-toolbar" className="flex shrink-0 items-center gap-2">
          {hasTranscript && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={saveHookFromTranscript}
              disabled={savingHook || hookSaved}
              className="shrink-0"
              title={dict.saveHookTitle}
            >
              {hookSaved ? (
                <Check className="h-4 w-4 text-success" />
              ) : (
                <BookmarkPlus className="h-4 w-4" />
              )}
              {hookSaved ? dict.saved : dict.saveHookButton}
            </Button>
          )}

          {hasTranscript && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={copyTranscript}
              className="shrink-0"
            >
              {copied ? (
                <Check className="h-4 w-4 text-success" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              {copied ? dict.copiedButton : dict.copyButton}
            </Button>
          )}

          {hasSrt && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={downloadSrt}
              className="shrink-0"
              title={dict.srtTitle}
            >
              <Download className="h-4 w-4" />
              {dict.srtButton}
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
            {isLoading ? dict.transcribing : hasTranscript ? dict.regenerateButton : dict.generateButton}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <AiThinking messages={dict.loadingMessages} className="mt-3" />
      ) : hasTranscript ? (
        <div className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-background p-3 leading-relaxed text-foreground">
          {transcript}
        </div>
      ) : status === "failed" ? (
        <p className="mt-3 text-subtle">
          {dict.failedMessage}
        </p>
      ) : (
        <p className="mt-3 text-subtle">
          {dict.introMessage}
        </p>
      )}
    </div>
  );
}
