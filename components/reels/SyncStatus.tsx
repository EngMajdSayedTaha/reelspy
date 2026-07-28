"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Popover } from "radix-ui";
import { CheckCircle2, PauseCircle, RefreshCw } from "lucide-react";
import { useDict } from "@/lib/i18n/I18nProvider";
import { formatCountdown } from "@/lib/utils/time";

type SyncState = "idle" | "refreshing" | "paused";

type Status = {
  state: SyncState;
  lastSyncedAt: string | null;
  refreshingCount: number;
  pausedUntil: string | null;
  quota: { used: number; limit: number; resetAt: string | null };
};

const POLL_MS = 60_000;
// While paused we tick every second for the countdown; otherwise we only need
// the "synced 4m ago" label to stay roughly honest.
const TICK_PAUSED_MS = 1_000;
const TICK_IDLE_MS = 30_000;
// Only mention the refresh quota when it's close enough to matter. Showing it
// permanently is what made the old widget feel like a meter users had to manage.
const QUOTA_NOTICE_THRESHOLD = 0.75;

// Top-bar sync chip. Answers "is my data current?" in three states — up to
// date, refreshing, paused — instead of showing a percentage of Meta's request
// budget. See lib/instagram/sync-status.ts for why the budget framing was
// removed: the main Sync All path is served from a shared cache and never
// spends it, so the old gauge read 100% forever and then flipped to a red
// "limit reached" pill for something the user hadn't done.
//
// Every duration is derived from an absolute deadline and the current clock,
// never accumulated by a timer. Background tabs throttle intervals to about
// once a minute, so the old decrement-a-counter countdown massively overstated
// the remaining wait whenever the tab wasn't focused — the single most likely
// reason a cooldown looked like it never ended.
export function SyncStatus() {
  const dict = useDict().feed.syncStatus;
  const [status, setStatus] = useState<Status | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const clearedRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/ig/sync-status", { cache: "no-store" });
      if (!res.ok) return;
      setStatus((await res.json()) as Status);
    } catch {
      // Non-critical widget — keep the last known state on a transient failure.
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState happens after an awaited fetch
    refresh();
    const poll = setInterval(refresh, POLL_MS);

    // The sync surfaces tell us to re-read immediately rather than wait out the
    // poll. A 429 from a per-account sync carries a duration, which we convert
    // to a deadline straight away so the chip flips without a round-trip.
    const onRateLimit = (e: Event) => {
      const secs = (e as CustomEvent<{ retryAfterSeconds?: number }>).detail?.retryAfterSeconds ?? 0;
      if (secs > 0) {
        clearedRef.current = false;
        setStatus((s) => ({
          state: "paused",
          lastSyncedAt: s?.lastSyncedAt ?? null,
          refreshingCount: s?.refreshingCount ?? 0,
          pausedUntil: new Date(Date.now() + secs * 1000).toISOString(),
          quota: s?.quota ?? { used: 0, limit: 0, resetAt: null },
        }));
      }
      void refresh();
    };
    const onSyncActivity = () => void refresh();

    window.addEventListener("reelspy:ratelimit", onRateLimit);
    window.addEventListener("reelspy:synced", onSyncActivity);
    window.addEventListener("reelspy:syncing", onSyncActivity);
    return () => {
      clearInterval(poll);
      window.removeEventListener("reelspy:ratelimit", onRateLimit);
      window.removeEventListener("reelspy:synced", onSyncActivity);
      window.removeEventListener("reelspy:syncing", onSyncActivity);
    };
  }, [refresh]);

  const paused = status?.state === "paused" && Boolean(status.pausedUntil);

  // One clock for both the countdown and the relative timestamp.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), paused ? TICK_PAUSED_MS : TICK_IDLE_MS);
    return () => clearInterval(id);
  }, [paused]);

  // Re-read once the pause deadline passes so the chip leaves the paused state
  // from the server's answer rather than assuming it cleared.
  const pausedUntilMs = status?.pausedUntil ? new Date(status.pausedUntil).getTime() : 0;
  const remainingSeconds = pausedUntilMs > now ? Math.ceil((pausedUntilMs - now) / 1000) : 0;

  useEffect(() => {
    if (!pausedUntilMs || remainingSeconds > 0) {
      clearedRef.current = false;
      return;
    }
    if (clearedRef.current) return;
    clearedRef.current = true;
    void refresh();
  }, [pausedUntilMs, remainingSeconds, refresh]);

  if (!status) return null;

  const showPaused = paused && remainingSeconds > 0;
  const refreshing = !showPaused && status.state === "refreshing" && status.refreshingCount > 0;

  const { used, limit, resetAt } = status.quota;
  const quotaTight = limit > 0 && used / limit >= QUOTA_NOTICE_THRESHOLD;
  const quotaResetSeconds = resetAt
    ? Math.max(0, Math.ceil((new Date(resetAt).getTime() - now) / 1000))
    : 0;

  const syncedLabel = status.lastSyncedAt
    ? relativeLabel(now - new Date(status.lastSyncedAt).getTime(), dict)
    : dict.neverSynced;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={`flex min-w-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition sm:px-3 ${
            showPaused
              ? "border-warning/40 bg-warning/10 text-warning hover:bg-warning/15"
              : "border-border-strong bg-surface-2 text-muted-foreground hover:bg-secondary"
          }`}
        >
          {showPaused ? (
            <PauseCircle className="h-3.5 w-3.5 shrink-0" />
          ) : refreshing ? (
            <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
          )}
          {/* The countdown and the count never clip; the prose does. */}
          {showPaused ? (
            <>
              <span className="hidden truncate sm:inline">{dict.pausedLabel}&nbsp;·&nbsp;</span>
              <span className="shrink-0 font-semibold tabular-nums">
                {formatCountdown(remainingSeconds)}
              </span>
            </>
          ) : refreshing ? (
            <span className="truncate">{dict.updatingCount(status.refreshingCount)}</span>
          ) : (
            <span className="truncate">{syncedLabel}</span>
          )}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-[280px] space-y-2.5 rounded-xl border border-border bg-card p-4 text-sm shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95"
        >
          {showPaused ? (
            <>
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{dict.pausedHeading}</span>
                <span className="tabular-nums">{formatCountdown(remainingSeconds)}</span>
              </div>
              <p className="text-xs text-subtle">{dict.pausedExplainer}</p>
            </>
          ) : refreshing ? (
            <>
              <div className="text-xs text-muted-foreground">{dict.refreshingHeading}</div>
              <p className="text-xs text-subtle">{dict.refreshingExplainer}</p>
            </>
          ) : (
            <>
              <div className="text-xs text-muted-foreground">{dict.upToDateHeading}</div>
              <p className="text-xs text-subtle">{dict.upToDateExplainer}</p>
            </>
          )}

          {/* The refresh quota appears only when it's nearly spent — that's the
              one moment it tells the user something they can act on. */}
          {quotaTight ? (
            <p className="rounded-lg border border-border-strong bg-surface-2 px-2.5 py-2 text-xs text-muted-foreground">
              {dict.quotaNotice(Math.max(0, limit - used))}
              {quotaResetSeconds > 0 ? ` ${dict.quotaResets(formatCountdown(quotaResetSeconds))}` : ""}
            </p>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

// Coarse "how long ago" bucket. Deliberately not a live-ticking seconds display
// — the point is reassurance that the data is current, not precision.
function relativeLabel(
  ageMs: number,
  dict: ReturnType<typeof useDict>["feed"]["syncStatus"]
): string {
  const minutes = Math.floor(Math.max(0, ageMs) / 60_000);
  if (minutes < 1) return dict.syncedJustNow;
  if (minutes < 60) return dict.syncedMinutesAgo(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return dict.syncedHoursAgo(hours);
  return dict.syncedDaysAgo(Math.floor(hours / 24));
}
