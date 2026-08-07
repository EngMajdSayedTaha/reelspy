"use client";

import { useState } from "react";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TypeToConfirm } from "@/components/admin/TypeToConfirm";
import { requestJson, notifyError } from "@/lib/utils/api";

// Global "reset all" — flags every profiles row for a required password reset
// and revokes every live session except the acting admin's own (see
// app/api/admin/users/force-reset-all/route.ts). Reserved for suspected
// account-wide compromise, so it sits behind a typed-confirm dialog like the
// other blast-radius-large admin actions (TypeToConfirm), not a plain click.
export function SecurityPanel() {
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Force password reset — all users
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Requires every user to set a new password before they can use the app again, and immediately
          revokes every existing session except yours. Use this if you suspect passwords were exposed.
          Each user is redirected to /reset-password the next time they load the dashboard.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional, shown in audit log)…"
            className="max-w-sm"
          />
          <Button variant="destructive" size="lg" onClick={() => setOpen(true)}>
            <KeyRound className="h-4 w-4" />
            Force reset for all users
          </Button>
        </div>
      </section>

      <TypeToConfirm
        open={open}
        onOpenChange={setOpen}
        title="Force a password reset for every user?"
        description="Every account is flagged for a required reset and every existing session (except yours) is revoked immediately. This cannot be undone in bulk — you'd have to cancel each user's flag individually."
        confirmPhrase="RESET ALL"
        confirmLabel="Force reset all"
        onConfirm={async () => {
          try {
            const res = await requestJson<{ affected: number | null }>("/api/admin/users/force-reset-all", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ reason: reason.trim() || undefined, confirm: "RESET ALL" }),
            });
            toast.success(
              res.affected != null ? `Password reset required for ${res.affected} users` : "Password reset required for all users"
            );
            setReason("");
          } catch (err) {
            notifyError(err);
          }
        }}
      />
    </div>
  );
}
