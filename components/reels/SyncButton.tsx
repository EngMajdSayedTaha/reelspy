"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { notifyError, requestJson } from "@/lib/utils/api";

type SyncResult = {
  inserted?: number;
  updated?: number;
  errors?: string[];
};

const LIMIT_OPTIONS = [25, 50, 100, 200];

export function SyncButton() {
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);
  const [limit, setLimit] = useState(50);

  const handleSyncAll = async () => {
    setIsSyncing(true);

    try {
      const json = await requestJson<SyncResult>("/api/ig/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit }),
      });

      toast.success(`Synced: +${json.inserted ?? 0} new · ${json.updated ?? 0} refreshed`);
      if (json.errors?.length) {
        toast.warning(json.errors.join(" · "));
      }
      router.refresh();
    } catch (error) {
      notifyError(error, "Sync failed. Check your Instagram connection.");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-1.5 text-xs text-zinc-400">
        <span className="hidden sm:inline">Per account</span>
        <select
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          disabled={isSyncing}
          className="h-9 rounded-lg border border-[#262626] bg-[#141414] px-2 text-sm text-zinc-200 outline-none transition focus:border-[#F9E400]/60 focus:ring-2 focus:ring-[#F9E400]/20 disabled:opacity-50"
        >
          {LIMIT_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n} reels
            </option>
          ))}
        </select>
      </label>

      <Button type="button" size="lg" onClick={handleSyncAll} disabled={isSyncing}>
        <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
        {isSyncing ? "Syncing…" : "Sync All"}
      </Button>
    </div>
  );
}
