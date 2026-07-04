"use client";

import { useState, useTransition } from "react";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import { setDigestOptOut } from "@/app/dashboard/settings/actions";

// Weekly digest opt-in toggle (V3/W6). `subscribed` = NOT opted out.
export function DigestToggle({ initialOptOut }: { initialOptOut: boolean }) {
  const [subscribed, setSubscribed] = useState(!initialOptOut);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    const next = !subscribed;
    setSubscribed(next);
    startTransition(async () => {
      try {
        await setDigestOptOut(!next); // optOut = !subscribed
        toast.success(next ? "Weekly digest on" : "Weekly digest off");
      } catch {
        setSubscribed(!next);
        toast.error("Could not update your preference");
      }
    });
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary ring-1 ring-border-strong">
          <Mail className="h-5 w-5 text-brand" />
        </span>
        <div>
          <p className="font-semibold text-foreground">Weekly digest</p>
          <p className="text-xs text-muted-foreground">
            A weekly email with what&apos;s rising in your niche, hooks to reuse, and your loop nudge.
          </p>
        </div>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={subscribed}
        aria-label="Toggle weekly digest email"
        onClick={toggle}
        disabled={pending}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50 ${
          subscribed ? "bg-primary" : "bg-border-strong"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
            subscribed ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
