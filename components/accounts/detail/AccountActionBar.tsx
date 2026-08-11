"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderClosed, Power, RefreshCw, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { AccountArchive } from "@/components/accounts/AccountArchive";
import { getClientPrefs } from "@/lib/prefs";
import { ApiError, notifyError, requestJson } from "@/lib/utils/api";
import { useDict } from "@/lib/i18n/I18nProvider";
import type { ArchiveStatus } from "@/lib/instagram/archive-status";
import type { AccountGroup, AccountRow } from "@/lib/accounts/detail";

// Radix Select forbids an Item value of "" — same sentinel the grid card uses.
const NO_GROUP = "__none__";

type SyncResult = { inserted?: number; updated?: number; queued?: number; errors?: string[] };

/**
 * Sync controls, identical in behaviour to the grid card's — including the
 * `reelspy:*` CustomEvents the TopBar's SyncStatus listens for, and the
 * cache-first default that keeps a browsing session from burning the app-wide
 * hourly Instagram budget.
 */
export function AccountSyncControls({ account }: { account: AccountRow }) {
  const dict = useDict();
  const t = dict.accounts.card;
  const [syncLimit, setSyncLimit] = useState(25);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time cookie read after mount
    setSyncLimit(Math.min(100, getClientPrefs().syncLimit));
  }, []);

  const runSync = async (force: boolean) => {
    setIsSyncing(true);
    window.dispatchEvent(new CustomEvent("reelspy:syncing"));
    try {
      const json = await requestJson<SyncResult>("/api/ig/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: account.id,
          limit: syncLimit,
          ...(force ? { force: true } : { deferred: true }),
        }),
      });

      const inserted = json.inserted ?? 0;
      const updated = json.updated ?? 0;
      if ((json.queued ?? 0) > 0) {
        toast(t.queuedToast(account.ig_username), { icon: "🔄" });
      } else if (!force && inserted === 0 && updated === 0) {
        toast.success(t.alreadyFreshToast(account.ig_username));
      } else {
        toast.success(t.syncResultToast(account.ig_username, inserted, updated));
      }
      if (json.errors?.length) toast.warning(json.errors.join(" · "));
      window.dispatchEvent(new CustomEvent("reelspy:synced"));
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        window.dispatchEvent(
          new CustomEvent("reelspy:ratelimit", { detail: { retryAfterSeconds: error.retryAfterSeconds } })
        );
      }
      notifyError(error, t.syncFailedToast);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <>
      <Select
        value={String(syncLimit)}
        disabled={isSyncing}
        onValueChange={(value) => setSyncLimit(Number(value))}
      >
        <SelectTrigger aria-label={t.syncSelectAria} className="shrink-0 px-1.5 disabled:opacity-60">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {[25, 50, 100].map((n) => (
            <SelectItem key={n} value={String(n)}>
              {n}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button type="button" size="sm" onClick={() => runSync(false)} disabled={isSyncing}>
        <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
        {isSyncing ? t.syncing : t.syncButton}
      </Button>

      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => runSync(true)}
        disabled={isSyncing}
        aria-label={t.forceSyncLabel}
        title={t.forceSyncTitle}
      >
        <Zap className="h-4 w-4" />
      </Button>
    </>
  );
}

export function AccountManagePanel({
  account,
  groups,
  archive,
  transcribing,
  assignGroupAction,
  toggleActiveAction,
  removeAction,
}: {
  account: AccountRow;
  groups: AccountGroup[];
  archive: ArchiveStatus | null;
  transcribing: boolean;
  assignGroupAction: (formData: FormData) => Promise<void>;
  toggleActiveAction: (formData: FormData) => Promise<void>;
  removeAction: (formData: FormData) => Promise<void>;
}) {
  const dict = useDict();
  const router = useRouter();
  const confirm = useConfirm();
  const t = dict.accounts.detail.manage;
  const card = dict.accounts.card;

  const [groupId, setGroupId] = useState(account.group_id ?? "");
  const [isPending, startAction] = useTransition();
  const isActive = account.is_active !== false;

  const onGroupChange = (value: string) => {
    const previous = groupId;
    setGroupId(value);
    const data = new FormData();
    data.set("account_id", account.id);
    data.set("group_id", value);
    startAction(async () => {
      try {
        await assignGroupAction(data);
        const name = groups.find((g) => g.id === value)?.name;
        toast.success(value ? card.movedToGroupToast(name ?? "") : card.removedFromGroupToast);
      } catch {
        setGroupId(previous);
        toast.error(card.groupUpdateError);
      }
    });
  };

  const handleToggleActive = () => {
    const data = new FormData();
    data.set("account_id", account.id);
    data.set("is_active", isActive ? "false" : "true");
    startAction(async () => {
      try {
        await toggleActiveAction(data);
        toast.success(
          isActive ? card.pausedToast(account.ig_username) : card.activatedToast(account.ig_username)
        );
      } catch {
        toast.error(card.accountUpdateError);
      }
    });
  };

  const handleRemove = async () => {
    const ok = await confirm({
      title: card.removeConfirmTitle(account.ig_username),
      description: card.removeConfirmDesc,
      confirmText: dict.common.remove,
      destructive: true,
    });
    if (!ok) return;

    const data = new FormData();
    data.set("account_id", account.id);
    startAction(async () => {
      try {
        await removeAction(data);
        toast.success(card.removedToast(account.ig_username));
        // Navigation happens here, not via `redirect()` inside the server
        // action: redirect() throws NEXT_REDIRECT, which this try/catch would
        // swallow and report as a failure on a successful removal.
        router.push("/dashboard/accounts");
        router.refresh();
      } catch {
        toast.error(card.removeError);
      }
    });
  };

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <div>
        <h3 className="text-sm font-medium text-foreground">{t.title}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{t.subtitle}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <FolderClosed className="h-4 w-4 text-subtle" />
          {t.groupLabel}
        </label>
        <Select
          value={groupId || NO_GROUP}
          disabled={isPending}
          onValueChange={(value) => onGroupChange(value === NO_GROUP ? "" : value)}
        >
          <SelectTrigger aria-label={card.groupSelectAria} className="w-52 disabled:opacity-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_GROUP}>{dict.accounts.noGroupOption}</SelectItem>
            {groups.map((group) => (
              <SelectItem key={group.id} value={group.id}>
                {group.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleToggleActive}
          disabled={isPending}
          className={isActive ? "" : "border-warning/50 text-warning hover:bg-warning/10"}
        >
          <Power className="h-4 w-4" />
          {isActive ? card.pauseAria : card.resumeLabel}
        </Button>
      </div>

      <AccountArchive
        accountId={account.id}
        username={account.ig_username}
        initial={archive}
        transcribing={transcribing}
        hasReels={Boolean(account.last_synced_at) || Boolean(archive?.requested)}
        disabled={isPending}
      />

      {/* Destructive action last, away from everything routine. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger/5 p-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{t.removeHeading}</p>
          <p className="text-xs text-muted-foreground">{t.removeDesc}</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleRemove}
          disabled={isPending}
          className="shrink-0 border-danger/50 text-danger hover:bg-danger/10"
        >
          <Trash2 className="h-4 w-4" />
          {dict.common.remove}
        </Button>
      </div>
    </div>
  );
}
