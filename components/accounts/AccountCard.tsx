"use client";

import { useEffect, useState, useTransition } from "react";
import { RefreshCw, Trash2, Users, AtSign, FolderClosed, PauseCircle, Power } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { getClientPrefs } from "@/lib/prefs";
import { notifyError, requestJson } from "@/lib/utils/api";

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
  const confirm = useConfirm();
  const isActive = account.is_active !== false;

  // Controlled group value so the dropdown reflects the saved group immediately.
  const [groupId, setGroupId] = useState(account.group_id ?? "");
  const [syncedGroupId, setSyncedGroupId] = useState(account.group_id ?? "");
  if ((account.group_id ?? "") !== syncedGroupId) {
    setSyncedGroupId(account.group_id ?? "");
    setGroupId(account.group_id ?? "");
  }

  const [isAssigning, startAssign] = useTransition();
  const [isPendingAction, startAction] = useTransition();
  const [isSyncing, setIsSyncing] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [syncLimit, setSyncLimit] = useState(25);

  // Default sync depth comes from the user's saved preference (Settings).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time cookie read after mount
    setSyncLimit(Math.min(100, getClientPrefs().syncLimit));
  }, []);

  const busy = isSyncing || isAssigning || isPendingAction;

  // Server actions are invoked directly (not via <form action>) so we can show
  // toasts and avoid React 19's post-action form reset on the controlled select.
  const onGroupChange = (value: string) => {
    const previous = groupId;
    setGroupId(value);
    const data = new FormData();
    data.set("account_id", account.id);
    data.set("group_id", value);
    startAssign(async () => {
      try {
        await assignGroupAction(data);
        const groupName = groups.find((g) => g.id === value)?.name;
        toast.success(value ? `Moved to “${groupName}”` : "Removed from group");
      } catch {
        setGroupId(previous); // revert optimistic change
        toast.error("Could not update the group.");
      }
    });
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const json = await requestJson<SyncResult>("/api/ig/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: account.id, limit: syncLimit }),
      });
      toast.success(`@${account.ig_username}: +${json.inserted ?? 0} new · ${json.updated ?? 0} refreshed`);
      if (json.errors?.length) {
        toast.warning(json.errors.join(" · "));
      }
    } catch (error) {
      notifyError(error, "Sync failed.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleToggleActive = () => {
    const data = new FormData();
    data.set("account_id", account.id);
    data.set("is_active", isActive ? "false" : "true");
    startAction(async () => {
      try {
        await toggleActiveAction(data);
        toast.success(isActive ? `Paused @${account.ig_username}` : `Activated @${account.ig_username}`);
      } catch {
        toast.error("Could not update the account.");
      }
    });
  };

  const handleRemove = async () => {
    const ok = await confirm({
      title: `Remove @${account.ig_username}?`,
      description: "This also deletes its tracked reels. This can't be undone.",
      confirmText: "Remove",
      destructive: true,
    });
    if (!ok) return;

    const data = new FormData();
    data.set("account_id", account.id);
    startAction(async () => {
      try {
        await removeAction(data);
        toast.success(`Removed @${account.ig_username}`);
      } catch {
        toast.error("Could not remove the account.");
      }
    });
  };

  return (
    <article
      className={`space-y-3.5 rounded-2xl border p-3.5 text-foreground transition-colors ${
        isActive
          ? "border-border bg-card hover:border-border-strong"
          : "border-warning/40 border-dashed bg-background opacity-80"
      }`}
    >
      {/* Loud, unambiguous "this account is OFF" banner. */}
      {!isActive ? (
        <div className="flex items-center gap-2 rounded-lg bg-warning/10 px-2.5 py-1.5 text-xs font-medium text-warning">
          <PauseCircle className="h-4 w-4 shrink-0" />
          Paused — hidden from the feed and skipped by syncs
        </div>
      ) : null}

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {account.avatar_url && !avatarError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={account.avatar_url}
              alt={`@${account.ig_username}`}
              referrerPolicy="no-referrer"
              onError={() => setAvatarError(true)}
              className={`h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-border-strong ${
                isActive ? "" : "grayscale"
              }`}
            />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary ring-1 ring-border-strong">
              <AtSign className="h-5 w-5 text-subtle" />
            </span>
          )}
          <div className="min-w-0">
            <p className={`truncate text-base font-medium ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
              @{account.ig_username}
            </p>
            {account.display_name && account.display_name !== account.ig_username ? (
              <p className="truncate text-sm text-muted-foreground">{account.display_name}</p>
            ) : null}
          </div>
        </div>
        <Badge
          variant={isActive ? "default" : "outline"}
          className={isActive ? "" : "border-warning/50 bg-warning/15 text-warning"}
        >
          {isActive ? "Active" : "Paused"}
        </Badge>
      </div>

      <div className="flex flex-col gap-1 text-sm text-muted-foreground">
        <p className="flex items-center gap-1.5">
          <Users className="h-4 w-4 text-subtle" />
          {formatFollowers(account.followers_count)} followers
        </p>
        <p className="text-xs text-subtle">
          Last sync:{" "}
          {account.last_synced_at
            ? new Date(account.last_synced_at).toLocaleDateString("en-US")
            : "Never"}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <FolderClosed className="h-4 w-4 text-subtle" />
          Group
        </label>
        <select
          value={groupId}
          disabled={busy}
          aria-label="Assign group"
          onChange={(e) => onGroupChange(e.target.value)}
          className="h-9 flex-1 rounded-lg border border-border-strong bg-surface-2 px-2 text-sm text-foreground outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
        >
          <option value="">No group</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <select
          aria-label="Reels to sync"
          value={syncLimit}
          disabled={busy}
          onChange={(e) => setSyncLimit(Number(e.target.value))}
          className="h-9 shrink-0 rounded-lg border border-border-strong bg-surface-2 px-1.5 text-sm text-foreground outline-none transition focus:border-primary/60 disabled:opacity-60"
        >
          {[25, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>

        <Button
          type="button"
          size="sm"
          variant="default"
          className="flex-1"
          onClick={handleSync}
          disabled={busy}
        >
          <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
          {isSyncing ? "Syncing…" : "Sync"}
        </Button>

        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleToggleActive}
          disabled={busy}
          aria-label={isActive ? "Pause account" : "Activate account"}
          title={isActive ? "Pause (hide from feed)" : "Activate (show in feed)"}
          className={isActive ? "" : "border-warning/50 text-warning hover:bg-warning/10"}
        >
          <Power className="h-4 w-4" />
          {!isActive ? "Resume" : null}
        </Button>

        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleRemove}
          disabled={busy}
          aria-label="Remove account"
          title="Remove account"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </article>
  );
}
