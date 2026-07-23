"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Popover } from "radix-ui";
import { AlertTriangle, Gauge } from "lucide-react";
import { useDict } from "@/lib/i18n/I18nProvider";
import { formatCountdown } from "@/lib/utils/time";

type Status = {
  throttled: boolean;
  retryAfterSeconds: number;
  appUsagePct: number;
  userUsed: number;
  userCap: number;
  userResetSeconds: number;
};

const POLL_MS = 60_000;
const SEGMENTS = 8;

// Shows how much of the Instagram request budget is left and, when Meta's hourly
// limit is hit, a clear cooldown countdown ("retry in mm:ss"). Polls the status
// endpoint and reacts instantly to a 429 dispatched by the Sync button. Clicking
// the pill opens a popover with the user's own hourly budget, a plain-language
// explainer, and (while throttled) a note that the pause is app-wide plus an
// opt-in auto-resume toggle that SyncButton listens for via `reelspy:autoresume`.
//
// The shared app-level pool figure (X-App-Usage %) is deliberately NOT shown here
// — it's internal capacity a single user can't act on, and surfacing it just
// implies users are competing for a fixed pool (they aren't; the budget scales
// with the userbase). That gauge lives in the admin ops panel instead
// (components/admin/ops/LimitsPanel.tsx). We still read appUsagePct from the API
// to keep the status shape whole, but never render it to end users.
export function RateLimitStatus() {
  const dict = useDict().feed.rateLimit;
  const [status, setStatus] = useState<Status | null>(null);
  // Local ticking clock so the countdown updates every second without polling.
  const [retrySeconds, setRetrySeconds] = useState(0);
  const retryRef = useRef(0);
  // Purely cosmetic reactions to Sync button activity — never drive a refetch
  // on their own (the existing onSynced/onRateLimit listeners already do).
  const [syncPulse, setSyncPulse] = useState(false);
  const [successFlash, setSuccessFlash] = useState(false);
  const [autoResume, setAutoResume] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/ig/rate-limit", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as Status;
      setStatus(data);
      if (data.throttled && data.retryAfterSeconds > retryRef.current) {
        retryRef.current = data.retryAfterSeconds;
        setRetrySeconds(data.retryAfterSeconds);
      }
    } catch {
      // Non-critical widget — ignore transient failures.
    }
  }, []);

  useEffect(() => {
    // refresh() only setStates after an awaited fetch, so this isn't a
    // synchronous cascading render despite the lint heuristic.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    const poll = setInterval(refresh, POLL_MS);

    // Sync button tells us about a fresh throttle (with its retry window) and
    // signals completed syncs so we can refresh the budget immediately.
    const onRateLimit = (e: Event) => {
      const detail = (e as CustomEvent<{ retryAfterSeconds?: number }>).detail;
      const secs = detail?.retryAfterSeconds ?? 0;
      if (secs > 0) {
        retryRef.current = secs;
        setRetrySeconds(secs);
        setStatus((s) => ({
          throttled: true,
          retryAfterSeconds: secs,
          appUsagePct: s?.appUsagePct ?? 100,
          userUsed: s?.userUsed ?? 0,
          userCap: s?.userCap ?? 0,
          userResetSeconds: s?.userResetSeconds ?? 0,
        }));
      } else {
        setAutoResume(false);
      }
      refresh();
    };
    const onSynced = () => {
      setSyncPulse(false);
      setSuccessFlash(true);
      setTimeout(() => setSuccessFlash(false), 1500);
      refresh();
    };
    const onSyncing = () => setSyncPulse(true);

    window.addEventListener("reelspy:ratelimit", onRateLimit);
    window.addEventListener("reelspy:synced", onSynced);
    window.addEventListener("reelspy:syncing", onSyncing);
    return () => {
      clearInterval(poll);
      window.removeEventListener("reelspy:ratelimit", onRateLimit);
      window.removeEventListener("reelspy:synced", onSynced);
      window.removeEventListener("reelspy:syncing", onSyncing);
    };
  }, [refresh]);

  // Tick the cooldown down once per second.
  useEffect(() => {
    if (retrySeconds <= 0) return;
    const id = setInterval(() => {
      setRetrySeconds((prev) => {
        const next = prev - 1;
        retryRef.current = Math.max(0, next);
        if (next <= 0) {
          setStatus((s) => (s ? { ...s, throttled: false, retryAfterSeconds: 0 } : s));
          refresh();
        }
        return Math.max(0, next);
      });
    }, 1000);
    return () => clearInterval(id);
  }, [retrySeconds, refresh]);

  const toggleAutoResume = (enabled: boolean) => {
    setAutoResume(enabled);
    window.dispatchEvent(new CustomEvent("reelspy:autoresume", { detail: { enabled } }));
  };

  // Nothing to show until the limiter is provisioned (userCap > 0) or throttled.
  if (!status || (status.userCap === 0 && !status.throttled)) return null;

  const throttled = status.throttled && retrySeconds > 0;
  const used = status.userUsed;
  const cap = status.userCap;
  // Show REMAINING capacity, not consumption. Most syncs are served from the
  // shared snapshot cache and never spend this budget, so "you have headroom" is
  // both the truthful and the reassuring framing. 100% = full budget available.
  const usedPct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
  const remainingPct = 100 - usedPct;
  const near = remainingPct <= 20; // personal budget is running low (rare)
  // Segments fill to show how much budget is LEFT (full bar = plenty of room).
  const filledSegments = cap > 0 ? Math.round((remainingPct / 100) * SEGMENTS) : SEGMENTS;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        {throttled ? (
          <button
            type="button"
            className="flex min-w-0 items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 px-2.5 py-2 text-sm text-danger transition hover:bg-danger/15 sm:px-3"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {/* The prose shrinks/clips first; the countdown stays visible. */}
            <span className="hidden truncate sm:inline">{dict.throttledLong}&nbsp;</span>
            <span className="truncate sm:hidden">{dict.throttledShort}&nbsp;·&nbsp;</span>
            <span className="shrink-0 font-semibold tabular-nums">{formatCountdown(retrySeconds)}</span>
          </button>
        ) : (
          <button
            type="button"
            className={`flex min-w-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 transition sm:px-3 ${
              near
                ? "border-warning/40 bg-warning/10 hover:bg-warning/15"
                : "border-border-strong bg-surface-2 hover:bg-secondary"
            }`}
          >
            <Gauge
              className={`h-3.5 w-3.5 shrink-0 transition-colors ${
                successFlash ? "text-success" : near ? "text-warning" : "text-muted-foreground"
              } ${syncPulse ? "animate-pulse" : ""}`}
            />
            <div className="flex items-center gap-0.5">
              {Array.from({ length: SEGMENTS }, (_, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-1 rounded-full transition-colors ${
                    i < filledSegments ? (near ? "bg-warning" : "bg-foreground/70") : "bg-muted"
                  }`}
                />
              ))}
            </div>
          </button>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-[280px] space-y-3 rounded-xl border border-border bg-card p-4 text-sm shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95"
        >
          <div>
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{throttled ? dict.cooldownHeading : dict.hourlyBudgetHeading}</span>
              {throttled ? (
                <span className="tabular-nums">{formatCountdown(retrySeconds)}</span>
              ) : status.userResetSeconds > 0 ? (
                <span className="tabular-nums">{dict.resetsIn(formatCountdown(status.userResetSeconds))}</span>
              ) : null}
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              {/* Throttled = shared app-wide pause, so the personal bar reads as
                  "paused" rather than a percentage that would contradict the
                  cooldown. Otherwise the bar fills to show budget REMAINING. */}
              <div
                className={`h-full rounded-full transition-all ${
                  throttled ? "bg-danger/60" : near ? "bg-warning" : "bg-primary"
                }`}
                style={{ width: throttled ? "100%" : `${remainingPct}%` }}
              />
            </div>
            <p className="mt-1 text-xs tabular-nums text-muted-foreground">
              {throttled ? dict.pausedLabel : dict.capacityAvailable(remainingPct)}
            </p>
          </div>

          <p className="text-xs text-subtle">{dict.explainer}</p>

          {throttled ? (
            <>
              <p className="rounded-lg border border-border-strong bg-surface-2 px-2.5 py-2 text-xs text-muted-foreground">
                {dict.appWideNote}
              </p>
              <p className="rounded-lg border border-border-strong bg-surface-2 px-2.5 py-2 text-xs text-muted-foreground">
                {dict.backgroundNote}
              </p>
              <label className="flex items-center gap-2 rounded-lg border border-border-strong bg-surface-2 px-2.5 py-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={autoResume}
                  onChange={(e) => toggleAutoResume(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-border-strong text-primary focus:ring-2 focus:ring-primary/40"
                />
                {dict.autoResumeToggle}
              </label>
            </>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
