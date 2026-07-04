"use client";

import { useState, useTransition } from "react";
import { AtSign, Check, Plus } from "lucide-react";
import { toast } from "sonner";
import { switchActiveConnection } from "@/app/dashboard/connections/actions";
import type { IgConnectionSummary } from "@/lib/instagram/connections";

type Props = {
  connections: IgConnectionSummary[];
  activeId: string | null;
  /** How many IG accounts this plan may connect (Studio > 1). */
  connectionCap: number;
};

// Studio multi-account switcher (X4). Lists the user's connected IG research
// accounts and switches which one is active (drives Business Discovery / sync /
// insights). "Connect another" appears while under the plan cap.
export function WorkspaceSwitcher({ connections, activeId, connectionCap }: Props) {
  const [active, setActive] = useState(activeId);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canConnectMore = connections.length < connectionCap;

  const choose = (id: string) => {
    if (id === active || isPending) return;
    setPendingId(id);
    startTransition(async () => {
      const result = await switchActiveConnection(id);
      setPendingId(null);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setActive(id);
      toast.success("Switched active account");
    });
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Workspaces</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Switch which connected Instagram account drives research, sync and insights.
          </p>
        </div>
        {canConnectMore ? (
          <a
            href="/api/ig/connect"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border-strong bg-surface-2 px-3 py-2 text-sm font-medium text-foreground transition hover:border-primary/60 hover:text-brand"
          >
            <Plus className="h-4 w-4" /> Connect another
          </a>
        ) : null}
      </div>

      <ul className="mt-4 space-y-2">
        {connections.map((c) => {
          const isActive = c.id === active;
          const loading = pendingId === c.id;
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => choose(c.id)}
                disabled={isPending}
                aria-pressed={isActive}
                className={`flex w-full items-center gap-3 rounded-xl border p-3 text-start transition disabled:opacity-60 ${
                  isActive
                    ? "border-primary/50 bg-primary/10"
                    : "border-border bg-surface-2 hover:border-border-strong"
                }`}
              >
                {c.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.avatarUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-border-strong"
                  />
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary ring-1 ring-border-strong">
                    <AtSign className="h-4 w-4 text-muted-foreground" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    @{c.username ?? c.igUserId}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {c.tokenStatus === "invalid" ? "Needs reconnect" : isActive ? "Active" : "Tap to activate"}
                  </span>
                </span>
                {isActive ? (
                  <Check className="h-4 w-4 shrink-0 text-brand" />
                ) : loading ? (
                  <span className="text-xs text-muted-foreground">Switching…</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
