"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type SyncResult = {
  inserted?: number;
  skipped?: number;
  errors?: string[];
  error?: string;
};

export function SyncButton() {
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSyncAll = async () => {
    setIsSyncing(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/ig/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await response.json()) as SyncResult;

      if (!response.ok || json.error) {
        setError(json.error ?? "Sync failed.");
      } else {
        setMessage(`Sync complete: +${json.inserted ?? 0} new reels`);
        router.refresh();
      }
    } catch {
      setError("Sync failed. Check your Instagram connection.");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" onClick={handleSyncAll} disabled={isSyncing}>
        {isSyncing ? "Syncing all..." : "Sync All Accounts"}
      </Button>
      {message ? <p className="text-xs text-emerald-400">{message}</p> : null}
      {error ? <p className="text-xs text-rose-400">{error}</p> : null}
    </div>
  );
}
