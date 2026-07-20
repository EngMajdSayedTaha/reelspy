"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { getClientPrefs } from "@/lib/prefs";
import { ApiError, notifyError, requestJson } from "@/lib/utils/api";
import { formatCountdown } from "@/lib/utils/time";
import { useDict } from "@/lib/i18n/I18nProvider";
import type { Dict } from "@/lib/i18n/dictionaries";

type SyncResult = {
  inserted?: number;
  updated?: number;
  skippedFresh?: number;
  queued?: number;
  rateLimited?: boolean;
  retryAfterSeconds?: number;
  errors?: string[];
};

type SyncAccount = { id: string; ig_username: string; last_synced_at: string | null };

type AccountState = "pending" | "syncing" | "done" | "error" | "skipped";

// Resumable point left behind by a halted run — the exact items array (so
// indices stay meaningful) plus where to pick back up.
type ResumePoint = { items: SyncAccount[]; nextIndex: number };

function formatWindow(dict: Dict["feed"]["sync"], seconds?: number): string {
  if (!seconds || seconds <= 0) return dict.aboutAnHour;
  const mins = Math.ceil(seconds / 60);
  if (mins < 60) return dict.aboutMinutes(mins);
  const hrs = Math.round(mins / 60);
  return dict.aboutHours(hrs);
}

const LIMIT_OPTIONS = [25, 50, 100, 200];

type Props = {
  /** Accounts eligible for sync — when provided, the button orchestrates a
   *  sequential per-account sync with live progress instead of one big
   *  server-side loop. Omitted by the simpler onboarding-wizard sync button
   *  (components/onboarding/OnboardingControls.tsx), which keeps the old
   *  single-request behavior. */
  accounts?: SyncAccount[];
  /** Matches the server's SYNC_SKIP_FRESH_SECONDS — accounts synced more
   *  recently than this are skipped client-side before any request goes out. */
  skipFreshSeconds?: number;
};

export function SyncButton({ accounts, skipFreshSeconds = 1800 }: Props) {
  const dict = useDict().feed.sync;
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);
  const [limit, setLimit] = useState(25);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  // Per-account orchestration (only used on the `accounts` path).
  const [queue, setQueue] = useState<SyncAccount[]>([]);
  const [statuses, setStatuses] = useState<AccountState[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const abortRef = useRef<AbortController | null>(null);
  const resumeRef = useRef<ResumePoint | null>(null);
  const [autoResumeArmed, setAutoResumeArmed] = useState(false);

  // Mirrors `limit` for the auto-resume effects below — their event listeners
  // are only re-registered when cooldown/arm state changes, so reading a ref
  // (instead of closing over `limit` directly) keeps a resumed sync honoring
  // whatever depth the user most recently picked.
  const limitRef = useRef(limit);
  useEffect(() => {
    limitRef.current = limit;
  }, [limit]);

  // Default sync depth comes from the user's saved preference (Settings).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time cookie read after mount
    setLimit(getClientPrefs().syncLimit);
  }, []);

  // Tick the cooldown down once per second so the button's inline countdown
  // stays live without re-fetching anything.
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const id = setInterval(() => setCooldownSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldownSeconds]);

  // The TopBar's budget popover (RateLimitStatus) exposes the same auto-resume
  // opt-in as a toggle, alongside the throttle toast's own action button.
  useEffect(() => {
    const onAutoResume = (e: Event) => {
      const detail = (e as CustomEvent<{ enabled?: boolean }>).detail;
      setAutoResumeArmed(Boolean(detail?.enabled));
    };
    window.addEventListener("reelspy:autoresume", onAutoResume);
    return () => window.removeEventListener("reelspy:autoresume", onAutoResume);
  }, []);

  const startCooldown = (seconds?: number) => {
    const secs = Math.max(0, Math.floor(seconds ?? 0));
    setCooldownSeconds(secs);
    window.dispatchEvent(new CustomEvent("reelspy:ratelimit", { detail: { retryAfterSeconds: secs } }));
  };

  // Sequential per-account sync (the `accounts` path). Runs items[startIndex..]
  // one at a time so the gauge and the progress bar both tick live; halts on
  // the first 429 and leaves the rest in `resumeRef` for a manual or opt-in
  // auto retry once the budget resets.
  const runQueue = async (items: SyncAccount[], startIndex: number) => {
    setIsSyncing(true);
    const controller = new AbortController();
    abortRef.current = controller;
    window.dispatchEvent(new CustomEvent("reelspy:syncing"));

    let totalInserted = 0;
    let totalUpdated = 0;
    let totalQueued = 0;
    let rateLimited = false;
    let retryAfterSeconds: number | undefined;
    let stoppedByUser = false;
    let i = startIndex;

    for (; i < items.length; i++) {
      if (controller.signal.aborted) {
        stoppedByUser = true;
        break;
      }
      const account = items[i];
      setCurrentIndex(i);
      setStatuses((prev) => {
        const next = [...prev];
        next[i] = "syncing";
        return next;
      });

      try {
        const json = await requestJson<SyncResult>("/api/ig/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // deferred: serve cache instantly + refresh in the background, so a
          // "Sync All" never blocks on Meta or on other users' syncs.
          body: JSON.stringify({ account_id: account.id, limit: limitRef.current, deferred: true }),
          signal: controller.signal,
        });
        totalInserted += json.inserted ?? 0;
        totalUpdated += json.updated ?? 0;
        totalQueued += json.queued ?? 0;
        setStatuses((prev) => {
          const next = [...prev];
          next[i] = "done";
          return next;
        });
        window.dispatchEvent(new CustomEvent("reelspy:synced"));
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          stoppedByUser = true;
          break;
        }
        if (error instanceof ApiError && error.status === 429) {
          rateLimited = true;
          retryAfterSeconds = error.retryAfterSeconds;
          setStatuses((prev) => {
            const next = [...prev];
            next[i] = "error";
            for (let j = i + 1; j < items.length; j++) next[j] = "skipped";
            return next;
          });
          window.dispatchEvent(
            new CustomEvent("reelspy:ratelimit", { detail: { retryAfterSeconds } })
          );
          break;
        }
        setStatuses((prev) => {
          const next = [...prev];
          next[i] = "error";
          return next;
        });
      }
    }

    abortRef.current = null;
    setIsSyncing(false);

    if (rateLimited) {
      const remaining = i + 1 < items.length;
      resumeRef.current = remaining ? { items, nextIndex: i + 1 } : null;
      setCooldownSeconds(Math.max(0, Math.floor(retryAfterSeconds ?? 0)));
      toast.warning(dict.rateLimitedToast(formatWindow(dict, retryAfterSeconds)), {
        icon: "⏳",
        duration: 10000,
        action: resumeRef.current
          ? { label: dict.resumeAction, onClick: () => setAutoResumeArmed(true) }
          : undefined,
      });
    } else if (!stoppedByUser) {
      toast.success(dict.syncedToast(totalInserted, totalUpdated));
      if (totalQueued > 0) {
        toast(dict.backgroundRefreshToast(totalQueued), { icon: "🔄", duration: 6000 });
      }
    } else {
      toast(dict.stoppedToast);
    }

    // Sync is over — the toast already reports the outcome, so retire the
    // progress dots. They're only meaningful while a run is in flight or paused
    // by a rate limit (kept below so the user can see where a resume picks up).
    if (!rateLimited) {
      setQueue([]);
      setStatuses([]);
      setCurrentIndex(-1);
    }

    router.refresh();
  };

  // Legacy single-request path — used when no `accounts` prop is supplied
  // (kept for any caller that hasn't migrated to per-account progress).
  const runLegacySync = async () => {
    setIsSyncing(true);
    window.dispatchEvent(new CustomEvent("reelspy:syncing"));
    const toastId = toast.loading(dict.syncing);

    try {
      const json = await requestJson<SyncResult>("/api/ig/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit }),
      });

      const skipped = json.skippedFresh ?? 0;
      toast.success(
        `${dict.syncedToast(json.inserted ?? 0, json.updated ?? 0)}${
          skipped > 0 ? dict.alreadyUpToDateSuffix(skipped) : ""
        }`,
        { id: toastId }
      );

      if (json.rateLimited) {
        toast.warning(dict.rateLimitedToast(formatWindow(dict, json.retryAfterSeconds)), {
          icon: "⏳",
          duration: 8000,
        });
        startCooldown(json.retryAfterSeconds);
      } else if (json.errors?.length) {
        toast.warning(json.errors.join(" · "));
      } else if ((json.queued ?? 0) > 0) {
        toast(dict.backgroundRefreshToast(json.queued as number), { icon: "🔄", duration: 6000 });
      }

      window.dispatchEvent(new CustomEvent("reelspy:synced"));
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        toast.error(dict.hourlyLimitToast(formatWindow(dict, error.retryAfterSeconds)), {
          id: toastId,
          icon: "⏳",
          duration: 8000,
        });
        startCooldown(error.retryAfterSeconds);
      } else {
        toast.dismiss(toastId);
        notifyError(error, dict.syncFailed);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncAll = () => {
    if (!accounts || accounts.length === 0) {
      void runLegacySync();
      return;
    }

    const skipBefore = Date.now() - skipFreshSeconds * 1000;
    const stale = accounts.filter(
      (a) => !a.last_synced_at || new Date(a.last_synced_at).getTime() < skipBefore
    );
    if (stale.length === 0) {
      toast.success(dict.everythingUpToDate);
      return;
    }

    resumeRef.current = null;
    setAutoResumeArmed(false);
    setQueue(stale);
    setStatuses(stale.map(() => "pending"));
    setCurrentIndex(-1);
    void runQueue(stale, 0);
  };

  const handleStop = () => abortRef.current?.abort();

  // Opt-in auto-resume (once the throttle countdown clears, in a visible tab
  // only): fires exactly once per arming, never loops, never touches the
  // limiter backend directly — it's just a normal resumed sync request.
  useEffect(() => {
    if (!autoResumeArmed || cooldownSeconds > 0 || !resumeRef.current) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const resume = resumeRef.current;
    resumeRef.current = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- disarming before the resumed run kicks off, not a cascading sync
    setAutoResumeArmed(false);
    void runQueue(resume.items, resume.nextIndex);
    // Only re-check when the countdown or the arm state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoResumeArmed, cooldownSeconds]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      if (!autoResumeArmed || cooldownSeconds > 0 || !resumeRef.current) return;
      const resume = resumeRef.current;
      resumeRef.current = null;
      setAutoResumeArmed(false);
      void runQueue(resume.items, resume.nextIndex);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoResumeArmed, cooldownSeconds]);

  const showProgress = queue.length > 0;
  const currentAccount = currentIndex >= 0 ? queue[currentIndex] : undefined;
  const progressCount = statuses.filter((s) => s !== "pending").length;

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="hidden sm:inline">{dict.perAccountLabel}</span>
          <Select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            disabled={isSyncing}
            aria-label={dict.perAccountAria}
          >
            {LIMIT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {dict.reelsOption(n)}
              </option>
            ))}
          </Select>
        </label>

        <Button
          type="button"
          size="lg"
          onClick={handleSyncAll}
          disabled={isSyncing || cooldownSeconds > 0}
        >
          {cooldownSeconds > 0 && !isSyncing ? (
            <span className="tabular-nums">{dict.retryIn(formatCountdown(cooldownSeconds))}</span>
          ) : (
            <>
              <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
              {isSyncing ? dict.syncing : dict.syncAllButton}
            </>
          )}
        </Button>

        {isSyncing ? (
          <Button type="button" variant="ghost" size="icon" onClick={handleStop} aria-label={dict.stopButton} title={dict.stopButton}>
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      {showProgress ? (
        <div className="flex w-full flex-col items-end gap-1">
          <div className="flex gap-0.5">
            {statuses.map((s, i) => (
              <span
                key={i}
                className={`h-1.5 w-4 rounded-full transition-colors ${
                  s === "done"
                    ? "bg-primary"
                    : s === "error"
                      ? "bg-danger/60"
                      : s === "syncing"
                        ? "bg-primary/50"
                        : "bg-muted"
                }`}
              />
            ))}
          </div>
          {isSyncing && currentAccount ? (
            <p className="text-xs text-subtle">
              @{currentAccount.ig_username} · {progressCount}/{queue.length}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
