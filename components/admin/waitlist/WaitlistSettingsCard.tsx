"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { requestJson, notifyError } from "@/lib/utils/api";
import { cn } from "@/lib/utils";

export type WaitlistFlagState = {
  enabled: boolean;
  enabledSince: string | null;
  autoApprove: boolean;
  sendEmails: boolean;
};

// The switch. Deliberately its own card at the top of the page with the
// consequences spelled out next to it, rather than a row in the generic
// settings JSON editor: turning this on changes what every visitor to the
// product sees, and that deserves a control that says so.
export function WaitlistSettingsCard({
  flag,
  onChange,
}: {
  flag: WaitlistFlagState;
  onChange: (next: WaitlistFlagState) => void;
}) {
  const confirm = useConfirm();
  const [saving, setSaving] = useState<string | null>(null);

  const save = async (patch: Partial<WaitlistFlagState>, key: string) => {
    setSaving(key);
    try {
      const res = await requestJson<{ flag: WaitlistFlagState }>("/api/admin/waitlist/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      onChange(res.flag);
      toast.success("Saved");
    } catch (err) {
      notifyError(err);
    } finally {
      setSaving(null);
    }
  };

  const toggleMaster = async () => {
    const turningOn = !flag.enabled;
    const ok = await confirm({
      title: turningOn ? "Close the product behind a waiting list?" : "Open the product to everyone?",
      description: turningOn
        ? "New visitors will see a join form instead of signup, and anyone who signs up from here on lands on a 'you're in line' screen until you approve them. Accounts that already exist keep their access."
        : "The gate comes down immediately. Everyone who was held — approved or not — gets straight into the dashboard.",
      confirmText: turningOn ? "Turn on" : "Turn off",
    });
    if (!ok) return;
    void save({ enabled: turningOn }, "enabled");
  };

  return (
    <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">Waiting list</h2>
            <span
              className={cn(
                "rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                flag.enabled ? "bg-warning/15 text-warning" : "bg-secondary text-muted-foreground"
              )}
            >
              {flag.enabled ? "On" : "Off"}
            </span>
          </div>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            {flag.enabled
              ? "The product is closed. Landing-page CTAs and /signup show the join form, and unapproved accounts are held on the waiting-list screen."
              : "The product is open. Signup works normally and nobody is held."}
          </p>
          {flag.enabled && flag.enabledSince ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Accounts created before {new Date(flag.enabledSince).toLocaleString()} are grandfathered in
              and never see the gate.
            </p>
          ) : null}
        </div>

        <Button
          type="button"
          size="lg"
          variant={flag.enabled ? "outline" : "default"}
          onClick={() => void toggleMaster()}
          disabled={saving !== null}
        >
          {saving === "enabled" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {flag.enabled ? "Turn off" : "Turn on"}
        </Button>
      </div>

      <div className="mt-5 flex flex-col gap-3 border-t border-border pt-4">
        <ToggleRow
          label="Auto-approve new entries"
          hint="Everyone who joins is let straight in. Turns the list into pure lead capture — you still collect the emails and the queue numbers, but nobody is actually held."
          checked={flag.autoApprove}
          busy={saving === "autoApprove"}
          disabled={saving !== null}
          onChange={(v) => void save({ autoApprove: v }, "autoApprove")}
        />
        <ToggleRow
          label="Send waiting-list emails"
          hint="The 'you're on the list' confirmation and the 'you're in' approval. Needs RESEND_API_KEY and EMAIL_FROM; without them sends are skipped silently either way."
          checked={flag.sendEmails}
          busy={saving === "sendEmails"}
          disabled={saving !== null}
          onChange={(v) => void save({ sendEmails: v }, "sendEmails")}
        />
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  busy,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  busy: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="mt-0.5 max-w-prose text-xs text-muted-foreground">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50",
          checked ? "bg-accent-brand" : "bg-secondary ring-1 ring-border"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-all",
            checked ? "start-[22px]" : "start-0.5",
            busy && "animate-pulse"
          )}
        />
      </button>
    </div>
  );
}
