"use client";

import { useState } from "react";
import { Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { notifyError, requestJson } from "@/lib/utils/api";

// Disconnect needs a confirmation step — it clears the stored token and the user
// has to re-run OAuth to reconnect. POSTs to the disconnect route on confirm
// (state changes never ride on GET navigations).
export function DisconnectButton() {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    const ok = await confirm({
      title: "Disconnect Instagram?",
      description:
        "ReelSpy will remove your saved Instagram connection. Your tracked reels stay, but syncing pauses until you reconnect.",
      confirmText: "Disconnect",
      cancelText: "Keep connected",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await requestJson("/api/ig/disconnect", { method: "POST" });
      window.location.href = "/dashboard/settings/instagram?success=disconnected";
    } catch (error) {
      notifyError(error, "Could not disconnect. Please try again.");
      setBusy(false);
    }
  };

  return (
    <Button type="button" variant="outline" onClick={handleClick} disabled={busy}>
      <Unplug className="h-4 w-4" />
      {busy ? "Disconnecting…" : "Disconnect"}
    </Button>
  );
}
