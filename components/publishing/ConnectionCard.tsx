"use client";

import { useState } from "react";
import { Link2, Unplug, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { notifyError, requestJson } from "@/lib/utils/api";
import { PLATFORM_LABELS, type Platform } from "@/lib/publishing/types";

type Props = {
  platform: Platform;
  connected: boolean;
  handle: string | null;
  needsReconnect: boolean;
  // Where the connect flow lives. IG/FB share the existing Meta OAuth route.
  connectHref: string;
  // Disconnect endpoint (TikTok/YouTube only). Omit for IG/FB.
  disconnectHref?: string;
  note: string;
};

export function ConnectionCard({
  platform,
  connected,
  handle,
  needsReconnect,
  connectHref,
  disconnectHref,
  note,
}: Props) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  const badge = !connected
    ? { label: "Not connected", cls: "border-border-strong bg-border-strong/50 text-muted-foreground" }
    : needsReconnect
      ? { label: "Reconnect needed", cls: "border-rose-500/40 bg-rose-500/10 text-rose-400" }
      : { label: "Connected", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" };

  const handleDisconnect = async () => {
    if (!disconnectHref) return;
    const ok = await confirm({
      title: `Disconnect ${PLATFORM_LABELS[platform]}?`,
      description: "ReelSpy will remove the saved connection. Reconnect anytime to resume posting.",
      confirmText: "Disconnect",
      cancelText: "Keep connected",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await requestJson(disconnectHref, { method: "POST" });
      window.location.reload();
    } catch (error) {
      notifyError(error, "Could not disconnect.");
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-foreground">{PLATFORM_LABELS[platform]}</p>
            <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
              {badge.label}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {connected && handle ? handle : note}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant={connected && !needsReconnect ? "outline" : "default"}>
            <a href={connectHref}>
              {connected ? (
                <>
                  <RefreshCw className="h-4 w-4" /> Reconnect
                </>
              ) : (
                <>
                  <Link2 className="h-4 w-4" /> Connect
                </>
              )}
            </a>
          </Button>
          {connected && disconnectHref ? (
            <Button type="button" variant="outline" disabled={busy} onClick={handleDisconnect}>
              <Unplug className="h-4 w-4" /> {busy ? "Removing…" : "Disconnect"}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
