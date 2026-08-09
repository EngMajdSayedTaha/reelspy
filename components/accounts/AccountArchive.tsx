"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, FileText, History, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ARCHIVE_RANGES, DEFAULT_ARCHIVE_RANGE, type ArchiveRange } from "@/lib/instagram/archive-range";
import type { ArchiveStatus } from "@/lib/instagram/archive-status";
import type { TranscribeAccountStatus } from "@/lib/media/transcribe-account-status";
import { useDict, useLocale } from "@/lib/i18n/I18nProvider";
import { notifyError, requestJson } from "@/lib/utils/api";

type AccountArchiveProps = {
  accountId: string;
  username: string;
  /** Server-rendered starting state, so a card doesn't have to fetch to render. */
  initial: ArchiveStatus | null;
  /** Whether there's anything to export yet (archived or previously synced). */
  hasReels: boolean;
  /** A bulk transcription run was already in flight when the page rendered. */
  transcribing?: boolean;
  disabled?: boolean;
};

type StartResponse = {
  status: "cached" | "running" | "queued";
  reelsFound?: number;
};

type StatusResponse = { archives: ArchiveStatus[] };

type TranscribeStartResponse = {
  status: "queued" | "running" | "nothing_to_do";
  progress: TranscribeAccountStatus;
};

type TranscribeStatusResponse = { progress: TranscribeAccountStatus };

/** What the export includes. Mirrors the `mode` param on the export route. */
type ExportMode = "metadata" | "transcripts";

// How often to re-check a walk in flight. A chunk is several paced Graph calls,
// so anything faster just asks the same question before the answer can change.
const POLL_MS = 5000;

// Bulk transcription moves in chunks of a few reels spread over hours, so it is
// polled far more slowly than an archive walk — a 5s poll would ask hundreds of
// times per visible change.
const TRANSCRIBE_POLL_MS = 20_000;

function isActive(status: ArchiveStatus | null): boolean {
  return Boolean(status?.requested && (status.status === "queued" || status.status === "running"));
}

function isTranscribing(status: TranscribeAccountStatus | null): boolean {
  return (
    status?.state === "queued" || status?.state === "running" || status?.state === "paused"
  );
}

export function AccountArchive({
  accountId,
  username,
  initial,
  hasReels,
  transcribing: transcribingInitially,
  disabled,
}: AccountArchiveProps) {
  const dict = useDict();
  const locale = useLocale();
  const t = dict.accounts.archive;
  const tt = t.transcribe;

  const [status, setStatus] = useState<ArchiveStatus | null>(initial);
  const [range, setRange] = useState<ArchiveRange>(DEFAULT_ARCHIVE_RANGE);
  const [isStarting, setIsStarting] = useState(false);

  // A run already in flight when the page rendered is SEEDED, not fetched: the
  // card only needs to know it should be polling, and the real counts arrive
  // with the first poll a moment later. Fetching per card on mount would be one
  // request per account to render a grid the server already knows the answer for.
  const [transcribe, setTranscribe] = useState<TranscribeAccountStatus | null>(
    transcribingInitially
      ? {
          accountId,
          state: "running",
          total: 0,
          ready: 0,
          failed: 0,
          remaining: 0,
          note: null,
        }
      : null
  );
  const [isTranscribeStarting, setIsTranscribeStarting] = useState(false);
  const [exportMode, setExportMode] = useState<ExportMode>("metadata");

  // Poll only while there's work in flight, and stop the moment there isn't:
  // the effect re-subscribes whenever `active` flips, so the cleanup below is
  // what ends the polling.
  const active = isActive(status);
  const transcribing = isTranscribing(transcribe);

  const refresh = useCallback(async () => {
    try {
      const json = await requestJson<StatusResponse>(
        `/api/ig/archive?account_id=${encodeURIComponent(accountId)}`
      );
      const next = json.archives?.[0];
      if (next) setStatus(next);
    } catch {
      // A failed poll is not worth a toast — the next tick retries, and the
      // walk is running on the server either way.
    }
  }, [accountId]);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [active, refresh]);

  const start = async () => {
    setIsStarting(true);
    try {
      const json = await requestJson<StartResponse>("/api/ig/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId, range }),
      });

      if (json.status === "cached") {
        toast.success(t.cachedToast(username));
      } else if (json.status === "running") {
        toast(t.runningToast(username), { icon: "🔄" });
      } else {
        toast(t.queuedToast(username), { icon: "🕓" });
      }

      // Reflect the new request immediately so the row switches to "archiving"
      // without waiting a full poll interval.
      await refresh();
    } catch (error) {
      notifyError(error, t.failedToast);
    } finally {
      setIsStarting(false);
    }
  };

  const refreshTranscribe = useCallback(async () => {
    try {
      const json = await requestJson<TranscribeStatusResponse>(
        `/api/ig/transcribe-account?account_id=${encodeURIComponent(accountId)}`
      );
      if (json.progress) setTranscribe(json.progress);
    } catch {
      // Same reasoning as the archive poll: the run continues server-side and
      // the next tick retries, so a failed poll isn't worth interrupting anyone.
    }
  }, [accountId]);

  useEffect(() => {
    if (!transcribing) return;
    const timer = setInterval(() => void refreshTranscribe(), TRANSCRIBE_POLL_MS);
    return () => clearInterval(timer);
  }, [transcribing, refreshTranscribe]);

  const startTranscribe = async () => {
    setIsTranscribeStarting(true);
    try {
      const json = await requestJson<TranscribeStartResponse>("/api/ig/transcribe-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId }),
      });

      if (json.progress) setTranscribe(json.progress);

      if (json.status === "nothing_to_do") {
        toast.success(tt.nothingToast(username));
      } else if (json.status === "running") {
        toast(tt.runningToast(username), { icon: "🔄" });
      } else {
        toast(tt.queuedToast(username), { icon: "🕓" });
      }
    } catch (error) {
      notifyError(error, tt.failedToast);
    } finally {
      setIsTranscribeStarting(false);
    }
  };

  const exportHref = (format: "csv" | "json" | "txt") =>
    `/api/ig/archive/export?account_id=${encodeURIComponent(accountId)}&format=${format}` +
    // TXT always carries transcripts, so the mode would be redundant there.
    (format !== "txt" && exportMode === "transcripts" ? "&mode=transcripts" : "");

  const oldest = status?.oldestSeenAt
    ? new Date(status.oldestSeenAt).toLocaleDateString(locale, {
        month: "short",
        year: "numeric",
      })
    : null;

  const busy = disabled || isStarting;

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <div className="flex items-center gap-2">
        <Select
          value={range}
          disabled={busy || active}
          onValueChange={(value) => setRange(value as ArchiveRange)}
        >
          <SelectTrigger aria-label={t.rangeAria} className="shrink-0 px-1.5 disabled:opacity-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ARCHIVE_RANGES.map((value) => (
              <SelectItem key={value} value={value}>
                {t.ranges[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="flex-1"
          onClick={start}
          disabled={busy || active}
          title={t.buttonTitle}
        >
          {active || isStarting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <History className="h-4 w-4" />
          )}
          {isStarting ? t.starting : t.button}
        </Button>
      </div>

      {hasReels ? (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="flex-1"
            onClick={startTranscribe}
            disabled={busy || transcribing || isTranscribeStarting}
            title={tt.buttonTitle}
          >
            {transcribing || isTranscribeStarting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            {isTranscribeStarting ? tt.starting : tt.button}
          </Button>

          <Select
            value={exportMode}
            onValueChange={(value) => setExportMode(value as ExportMode)}
          >
            <SelectTrigger aria-label={t.exportModeAria} className="shrink-0 px-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="metadata">{t.exportModes.metadata}</SelectItem>
              <SelectItem value="transcripts">{t.exportModes.transcripts}</SelectItem>
            </SelectContent>
          </Select>

          <Button
            asChild
            size="sm"
            variant="outline"
            aria-label={t.exportAria}
            title={t.exportTitle}
          >
            <a href={exportHref("csv")} download>
              <Download className="h-4 w-4" />
              CSV
            </a>
          </Button>
          <Button asChild size="sm" variant="outline" aria-label={t.exportJson}>
            <a href={exportHref("json")} download>
              JSON
            </a>
          </Button>
          {/* A plain-text dump of the transcripts — the format you paste into an
              AI. Always transcripts-only, so it ignores the mode selector. */}
          <Button asChild size="sm" variant="outline" aria-label={t.exportTxt} title={t.exportTxt}>
            <a href={exportHref("txt")} download>
              TXT
            </a>
          </Button>
        </div>
      ) : null}

      {transcribe && (transcribing || transcribe.total > 0) ? (
        <p className="flex items-center gap-1.5 text-xs text-subtle">
          {transcribe.state === "failed" ? (
            <>
              <TriangleAlert className="h-3.5 w-3.5 text-warning" />
              <span className="text-warning">{tt.failed}</span>
            </>
          ) : transcribe.state === "paused" ? (
            tt.paused(transcribe.remaining)
          ) : transcribing ? (
            // Counts are 0 until the first poll lands on a seeded run, and
            // "0 of 0 reels" would read as broken — say "starting" until we
            // actually know the numbers.
            transcribe.total > 0 ? (
              tt.working(transcribe.ready, transcribe.total)
            ) : (
              tt.starting
            )
          ) : (
            <>
              {tt.progress(transcribe.ready, transcribe.total)}
              {transcribe.failed > 0 ? ` · ${tt.skipped(transcribe.failed)}` : null}
            </>
          )}
        </p>
      ) : null}

      {status?.requested ? (
        <p className="flex items-center gap-1.5 text-xs text-subtle">
          {status.status === "failed" ? (
            <>
              <TriangleAlert className="h-3.5 w-3.5 text-warning" />
              <span className="text-warning">{t.failed}</span>
            </>
          ) : active ? (
            t.working(status.reelsFound)
          ) : (
            <>
              {status.status === "partial" ? t.partial(status.reelsFound) : t.done(status.reelsFound)}
              {/* "Everything" is a stronger claim than a date, so only make it
                  when the walk actually reached the account's first post. */}
              {status.exhausted ? ` · ${t.fullHistory}` : oldest ? ` · ${t.backTo(oldest)}` : null}
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
