"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, History, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { ARCHIVE_RANGES, DEFAULT_ARCHIVE_RANGE, type ArchiveRange } from "@/lib/instagram/archive-range";
import type { ArchiveStatus } from "@/lib/instagram/archive-status";
import { useDict, useLocale } from "@/lib/i18n/I18nProvider";
import { notifyError, requestJson } from "@/lib/utils/api";

type AccountArchiveProps = {
  accountId: string;
  username: string;
  /** Server-rendered starting state, so a card doesn't have to fetch to render. */
  initial: ArchiveStatus | null;
  /** Whether there's anything to export yet (archived or previously synced). */
  hasReels: boolean;
  disabled?: boolean;
};

type StartResponse = {
  status: "cached" | "running" | "queued";
  reelsFound?: number;
};

type StatusResponse = { archives: ArchiveStatus[] };

// How often to re-check a walk in flight. A chunk is several paced Graph calls,
// so anything faster just asks the same question before the answer can change.
const POLL_MS = 5000;

function isActive(status: ArchiveStatus | null): boolean {
  return Boolean(status?.requested && (status.status === "queued" || status.status === "running"));
}

export function AccountArchive({
  accountId,
  username,
  initial,
  hasReels,
  disabled,
}: AccountArchiveProps) {
  const dict = useDict();
  const locale = useLocale();
  const t = dict.accounts.archive;

  const [status, setStatus] = useState<ArchiveStatus | null>(initial);
  const [range, setRange] = useState<ArchiveRange>(DEFAULT_ARCHIVE_RANGE);
  const [isStarting, setIsStarting] = useState(false);

  // Poll only while there's work in flight, and stop the moment there isn't:
  // the effect re-subscribes whenever `active` flips, so the cleanup below is
  // what ends the polling.
  const active = isActive(status);

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

  const exportHref = (format: "csv" | "json") =>
    `/api/ig/archive/export?account_id=${encodeURIComponent(accountId)}&format=${format}`;

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
          aria-label={t.rangeAria}
          value={range}
          disabled={busy || active}
          onChange={(e) => setRange(e.target.value as ArchiveRange)}
          className="shrink-0 px-1.5 disabled:opacity-60"
        >
          {ARCHIVE_RANGES.map((value) => (
            <option key={value} value={value}>
              {t.ranges[value]}
            </option>
          ))}
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

        {hasReels ? (
          <>
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
          </>
        ) : null}
      </div>

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
