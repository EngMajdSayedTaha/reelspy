"use client";

import { useState, type ReactNode } from "react";
import { Link2, Unplug, RefreshCw, Camera, ThumbsUp, Music2, PlayCircle, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { notifyError, requestJson } from "@/lib/utils/api";
import { PLATFORM_LABELS, type Platform } from "@/lib/publishing/types";

// Icons live here (a client component) rather than being passed in as props —
// component functions can't cross the Server→Client boundary.
const PLATFORM_ICONS: Record<Platform, LucideIcon> = {
  instagram: Camera,
  facebook: ThumbsUp,
  tiktok: Music2,
  youtube: PlayCircle,
};

type Props = {
  platform: Platform;
  connected: boolean;
  handle: string | null;
  needsReconnect: boolean;
  // Where the connect flow lives. IG/FB share the existing Meta OAuth route.
  connectHref: string;
  // Disconnect endpoint. Omit to hide the disconnect button (e.g. Facebook,
  // which is unlinked together with Instagram).
  disconnectHref?: string;
  // Default subtext shown when the account isn't connected.
  note: string;
  // Status subline shown when connected (expiry, last renewal, …). Falls back
  // to the handle when omitted.
  detail?: ReactNode;
  // When the platform isn't configured on the server, disable the connect CTA.
  disabled?: boolean;
  // Extra full-width content under the header (setup details, warnings).
  children?: ReactNode;
  // Override the disconnect confirmation copy (IG affects syncing, not just posting).
  disconnectConfirm?: { title?: string; description?: string };
};

export function ConnectionCard({
  platform,
  connected,
  handle,
  needsReconnect,
  connectHref,
  disconnectHref,
  note,
  detail,
  disabled = false,
  children,
  disconnectConfirm,
}: Props) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const Icon = PLATFORM_ICONS[platform];

  const badge = !connected
    ? { label: "Not connected", cls: "border-border-strong bg-border-strong/50 text-muted-foreground" }
    : needsReconnect
      ? { label: "Reconnect needed", cls: "border-danger/40 bg-danger/10 text-danger" }
      : { label: "Connected", cls: "border-success/40 bg-success/10 text-success" };

  const handleDisconnect = async () => {
    if (!disconnectHref) return;
    const ok = await confirm({
      title: disconnectConfirm?.title ?? `Disconnect ${PLATFORM_LABELS[platform]}?`,
      description:
        disconnectConfirm?.description ??
        "ReelSpy will remove the saved connection. Reconnect anytime to resume posting.",
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

  // When connected, prefer the rich detail line, then the handle, then the note.
  const subtext = connected ? detail ?? handle ?? note : note;

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/15 to-secondary ring-1 ring-border-strong">
            <Icon className="h-5 w-5 text-brand" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-foreground">
                {connected && handle ? handle : PLATFORM_LABELS[platform]}
              </p>
              <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
                {badge.label}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{subtext}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {disabled ? (
            <Button disabled>
              <Link2 className="h-4 w-4" /> Connect
            </Button>
          ) : (
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
          )}
          {connected && disconnectHref ? (
            <Button type="button" variant="outline" disabled={busy} onClick={handleDisconnect}>
              <Unplug className="h-4 w-4" /> {busy ? "Removing…" : "Disconnect"}
            </Button>
          ) : null}
        </div>
      </div>

      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}
