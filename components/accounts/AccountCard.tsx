"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Account = {
  id: string;
  ig_username: string;
  display_name: string | null;
  followers_count: number | null;
  is_active: boolean | null;
  last_synced_at: string | null;
};

type AccountCardProps = {
  account: Account;
  removeAction: (formData: FormData) => Promise<void>;
};

type SyncResult = {
  inserted?: number;
  skipped?: number;
  errors?: string[];
  error?: string;
};

function formatFollowers(n: number | null): string {
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function AccountCard({ account, removeAction }: AccountCardProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncMsg(null);
    setSyncError(null);

    try {
      const response = await fetch("/api/ig/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: account.id }),
      });
      const json = (await response.json()) as SyncResult;

      if (!response.ok || json.error) {
        setSyncError(json.error ?? "Sync failed.");
      } else {
        const msg = `+${json.inserted ?? 0} new reels, ${json.skipped ?? 0} already tracked`;
        setSyncMsg(msg);
        if (json.errors?.length) {
          setSyncError(json.errors.join(" · "));
        }
      }
    } catch {
      setSyncError("Sync failed.");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <article className="space-y-4 rounded-xl border border-[#1f1f1f] bg-[#111111] p-4 text-zinc-100">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-medium text-white">@{account.ig_username}</p>
          {account.display_name && account.display_name !== account.ig_username ? (
            <p className="text-sm text-zinc-400">{account.display_name}</p>
          ) : null}
        </div>
        <Badge variant={account.is_active ? "default" : "outline"}>
          {account.is_active ? "Active" : "Paused"}
        </Badge>
      </div>

      <div className="grid gap-2 text-sm text-zinc-300 sm:grid-cols-2">
        <p>Followers: {formatFollowers(account.followers_count)}</p>
        <p>
          Last sync:{" "}
          {account.last_synced_at
            ? new Date(account.last_synced_at).toLocaleDateString("en-US")
            : "Never"}
        </p>
      </div>

      {syncMsg ? <p className="text-sm text-emerald-400">{syncMsg}</p> : null}
      {syncError ? <p className="text-sm text-rose-400">{syncError}</p> : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="default"
          className="flex-1 sm:flex-none"
          onClick={handleSync}
          disabled={isSyncing}
        >
          {isSyncing ? "Syncing..." : "Sync Reels"}
        </Button>

        <form action={removeAction}>
          <input type="hidden" name="account_id" value={account.id} />
          <Button type="submit" variant="outline" disabled={isSyncing}>
            Remove
          </Button>
        </form>
      </div>
    </article>
  );
}
