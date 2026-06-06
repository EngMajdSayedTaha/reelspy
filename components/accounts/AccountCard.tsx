"use client";

import { useState } from "react";
import { RefreshCw, Trash2, Users, AtSign, FolderClosed, Power } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Account = {
  id: string;
  ig_username: string;
  display_name: string | null;
  avatar_url: string | null;
  followers_count: number | null;
  is_active: boolean | null;
  last_synced_at: string | null;
  group_id: string | null;
};

type Group = { id: string; name: string };

type AccountCardProps = {
  account: Account;
  groups: Group[];
  removeAction: (formData: FormData) => Promise<void>;
  assignGroupAction: (formData: FormData) => Promise<void>;
  toggleActiveAction: (formData: FormData) => Promise<void>;
};

type SyncResult = {
  inserted?: number;
  updated?: number;
  errors?: string[];
  error?: string;
};

function formatFollowers(n: number | null): string {
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function AccountCard({
  account,
  groups,
  removeAction,
  assignGroupAction,
  toggleActiveAction,
}: AccountCardProps) {
  const isActive = account.is_active !== false;

  // Controlled group value so the dropdown reflects the saved group immediately
  // (an uncontrolled select would reset/lag after the server action).
  const [groupId, setGroupId] = useState(account.group_id ?? "");
  const [syncedGroupId, setSyncedGroupId] = useState(account.group_id ?? "");
  if ((account.group_id ?? "") !== syncedGroupId) {
    setSyncedGroupId(account.group_id ?? "");
    setGroupId(account.group_id ?? "");
  }
  const [isSyncing, setIsSyncing] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
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
        body: JSON.stringify({ account_id: account.id, limit: 50 }),
      });
      const json = (await response.json()) as SyncResult;

      if (!response.ok || json.error) {
        setSyncError(json.error ?? "Sync failed.");
      } else {
        setSyncMsg(`+${json.inserted ?? 0} new · ${json.updated ?? 0} refreshed`);
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
    <article
      className={`space-y-4 rounded-2xl border border-[#1f1f1f] bg-[#111111] p-4 text-zinc-100 transition-colors hover:border-[#2e2e2e] ${
        isActive ? "" : "opacity-60"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {account.avatar_url && !avatarError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={account.avatar_url}
              alt={`@${account.ig_username}`}
              referrerPolicy="no-referrer"
              onError={() => setAvatarError(true)}
              className="h-11 w-11 shrink-0 rounded-full object-cover ring-1 ring-[#2e2e2e]"
            />
          ) : (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#1a1a1a] ring-1 ring-[#2e2e2e]">
              <AtSign className="h-5 w-5 text-zinc-500" />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-lg font-medium text-white">@{account.ig_username}</p>
            {account.display_name && account.display_name !== account.ig_username ? (
              <p className="truncate text-sm text-zinc-400">{account.display_name}</p>
            ) : null}
          </div>
        </div>
        <Badge variant={isActive ? "default" : "outline"}>
          {isActive ? "Active" : "Paused"}
        </Badge>
      </div>

      <div className="grid gap-2 text-sm text-zinc-300 sm:grid-cols-2">
        <p className="flex items-center gap-1.5">
          <Users className="h-4 w-4 text-zinc-500" />
          {formatFollowers(account.followers_count)} followers
        </p>
        <p className="text-zinc-400">
          Last sync:{" "}
          {account.last_synced_at
            ? new Date(account.last_synced_at).toLocaleDateString("en-US")
            : "Never"}
        </p>
      </div>

      <form action={assignGroupAction} className="flex items-center gap-2">
        <input type="hidden" name="account_id" value={account.id} />
        <label className="flex items-center gap-1.5 text-sm text-zinc-400">
          <FolderClosed className="h-4 w-4 text-zinc-500" />
          Group
        </label>
        <select
          name="group_id"
          value={groupId}
          onChange={(e) => {
            setGroupId(e.target.value);
            e.currentTarget.form?.requestSubmit();
          }}
          className="h-9 flex-1 rounded-lg border border-[#262626] bg-[#141414] px-2 text-sm text-zinc-200 outline-none transition focus:border-[#F9E400]/60 focus:ring-2 focus:ring-[#F9E400]/20"
        >
          <option value="">No group</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </form>

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
          <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
          {isSyncing ? "Syncing…" : "Sync Reels"}
        </Button>

        <form action={toggleActiveAction}>
          <input type="hidden" name="account_id" value={account.id} />
          <input type="hidden" name="is_active" value={isActive ? "false" : "true"} />
          <Button
            type="submit"
            variant="outline"
            disabled={isSyncing}
            title={isActive ? "Pause (hide from feed)" : "Activate (show in feed)"}
          >
            <Power className="h-4 w-4" />
            {isActive ? "Pause" : "Activate"}
          </Button>
        </form>

        <form action={removeAction}>
          <input type="hidden" name="account_id" value={account.id} />
          <Button type="submit" variant="outline" disabled={isSyncing}>
            <Trash2 className="h-4 w-4" />
            Remove
          </Button>
        </form>
      </div>
    </article>
  );
}
