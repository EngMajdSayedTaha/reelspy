"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getClientPrefs } from "@/lib/prefs";
import { ApiError, notifyError, requestJson } from "@/lib/utils/api";
import { useDict } from "@/lib/i18n/I18nProvider";
import type { Dict } from "@/lib/i18n/dictionaries";

type SyncResult = {
  inserted?: number;
  updated?: number;
  skippedFresh?: number;
  rateLimited?: boolean;
  retryAfterSeconds?: number;
  errors?: string[];
};

function formatWindow(dict: Dict["feed"]["sync"], seconds?: number): string {
  if (!seconds || seconds <= 0) return dict.aboutAnHour;
  const mins = Math.ceil(seconds / 60);
  if (mins < 60) return dict.aboutMinutes(mins);
  const hrs = Math.round(mins / 60);
  return dict.aboutHours(hrs);
}

const LIMIT_OPTIONS = [25, 50, 100, 200];

export function SyncButton() {
  const dict = useDict().feed.sync;
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);
  const [limit, setLimit] = useState(25);

  // Default sync depth comes from the user's saved preference (Settings).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time cookie read after mount
    setLimit(getClientPrefs().syncLimit);
  }, []);

  const handleSyncAll = async () => {
    setIsSyncing(true);

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
        }`
      );

      // Partial throttle (some reels synced from cache, then we paused).
      if (json.rateLimited) {
        toast.warning(dict.rateLimitedToast(formatWindow(dict, json.retryAfterSeconds)), {
          icon: "⏳",
          duration: 8000,
        });
        window.dispatchEvent(
          new CustomEvent("reelspy:ratelimit", {
            detail: { retryAfterSeconds: json.retryAfterSeconds },
          })
        );
      } else if (json.errors?.length) {
        toast.warning(json.errors.join(" · "));
      }

      window.dispatchEvent(new CustomEvent("reelspy:synced"));
      router.refresh();
    } catch (error) {
      // A full 429 (nothing synced) gets a clear, friendly message + cooldown.
      if (error instanceof ApiError && error.status === 429) {
        toast.error(dict.hourlyLimitToast(formatWindow(dict, error.retryAfterSeconds)), {
          icon: "⏳",
          duration: 8000,
        });
        window.dispatchEvent(
          new CustomEvent("reelspy:ratelimit", {
            detail: { retryAfterSeconds: error.retryAfterSeconds },
          })
        );
      } else {
        notifyError(error, dict.syncFailed);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="hidden sm:inline">{dict.perAccountLabel}</span>
        <select
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          disabled={isSyncing}
          aria-label={dict.perAccountAria}
          className="h-9 rounded-lg border border-border-strong bg-surface-2 px-2 text-base md:text-sm text-foreground outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
        >
          {LIMIT_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {dict.reelsOption(n)}
            </option>
          ))}
        </select>
      </label>

      <Button type="button" size="lg" onClick={handleSyncAll} disabled={isSyncing}>
        <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
        {isSyncing ? dict.syncing : dict.syncAllButton}
      </Button>
    </div>
  );
}
