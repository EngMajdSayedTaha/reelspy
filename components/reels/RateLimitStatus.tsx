"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Gauge } from "lucide-react";

type Status = {
  throttled: boolean;
  retryAfterSeconds: number;
  appUsagePct: number;
  userUsed: number;
  userCap: number;
  userResetSeconds: number;
};

const POLL_MS = 60_000;

function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

// Shows how much of the Instagram request budget is left and, when Meta's hourly
// limit is hit, a clear cooldown countdown ("retry in mm:ss"). Polls the status
// endpoint and reacts instantly to a 429 dispatched by the Sync button.
export function RateLimitStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  // Local ticking clock so the countdown updates every second without polling.
  const [retrySeconds, setRetrySeconds] = useState(0);
  const retryRef = useRef(0);

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
      }
      refresh();
    };
    const onSynced = () => refresh();

    window.addEventListener("reelspy:ratelimit", onRateLimit);
    window.addEventListener("reelspy:synced", onSynced);
    return () => {
      clearInterval(poll);
      window.removeEventListener("reelspy:ratelimit", onRateLimit);
      window.removeEventListener("reelspy:synced", onSynced);
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

  // Nothing to show until the limiter is provisioned (userCap > 0) or throttled.
  if (!status || (status.userCap === 0 && !status.throttled)) return null;

  const throttled = status.throttled && retrySeconds > 0;

  if (throttled) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>
          Instagram hourly limit reached — retry in{" "}
          <span className="font-semibold tabular-nums">{formatCountdown(retrySeconds)}</span>
        </span>
      </div>
    );
  }

  const used = status.userUsed;
  const cap = status.userCap;
  const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
  const near = pct >= 80;

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${
        near
          ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
          : "border-[#262626] bg-[#141414] text-zinc-400"
      }`}
      title={
        status.userResetSeconds > 0
          ? `Resets in ${formatCountdown(status.userResetSeconds)}`
          : "Hourly Instagram sync budget"
      }
    >
      <Gauge className="h-3.5 w-3.5 shrink-0" />
      <span>
        Sync budget{" "}
        <span className="font-semibold tabular-nums">
          {used}/{cap}
        </span>{" "}
        this hour
      </span>
    </div>
  );
}
