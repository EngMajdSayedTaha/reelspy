"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Circle, HelpCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ResubscribeResult } from "@/app/dashboard/automations/actions";

type DmDiagnosticsProps = {
  /** profiles.webhook_subscribed_at — null when the page was never subscribed. */
  subscribedAt: string | null;
  resubscribeAction: () => Promise<ResubscribeResult>;
};

// "DMs auto-reply isn't firing" is almost always a delivery-setup gap, not a
// code bug. This panel makes the fix self-serve: re-run the page subscription
// (no full reconnect needed) and read back whether Meta reports the `messages`
// field, then list the two manual Meta-side steps we can't toggle for the user.
export function DmDiagnostics({ subscribedAt, resubscribeAction }: DmDiagnosticsProps) {
  const [fields, setFields] = useState<string[] | null>(null);
  const [isPending, startTransition] = useTransition();

  // null = unknown until the user runs the check.
  const hasMessages: boolean | null = fields ? fields.includes("messages") : null;
  const subscribed = Boolean(subscribedAt) || fields !== null;

  const run = () => {
    startTransition(async () => {
      try {
        const result = await resubscribeAction();
        if (result.error) {
          toast.error(result.error);
          return;
        }
        setFields(result.fields ?? []);
        if (result.fields?.includes("messages")) {
          toast.success("Re-subscribed — the messages field is active. DMs should now deliver.");
        } else {
          toast.warning(
            "Re-subscribed, but Meta isn't reporting the messages field yet. Complete the two manual steps below, then run this again."
          );
        }
      } catch {
        toast.error("Could not re-subscribe. Try again.");
      }
    });
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-brand" />
          <h3 className="font-semibold text-foreground">DM delivery check</h3>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={run} disabled={isPending}>
          <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
          {isPending ? "Checking…" : "Re-subscribe & check"}
        </Button>
      </div>

      <ul className="space-y-1.5 text-muted-foreground">
        <Item ok={subscribed}>Page subscribed to webhooks</Item>
        <Item ok={hasMessages}>
          <span>
            <code className="rounded bg-secondary px-1 py-0.5 text-xs">messages</code> field active
            on the page subscription
            {hasMessages === null ? " (run the check above)" : ""}
          </span>
        </Item>
      </ul>

      <div className="space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Two steps only you can do in Meta:</p>
        <p>
          1. App Dashboard → Products → Webhooks → Instagram object → subscribe the{" "}
          <code className="rounded bg-secondary px-1 py-0.5">messages</code> field.
        </p>
        <p>
          2. On the IG account: Settings → Messages and story replies → Connected tools → turn{" "}
          <span className="font-medium">&ldquo;Allow access to messages&rdquo;</span> ON. The app
          must also be in Live mode.
        </p>
      </div>
    </div>
  );
}

function Item({ ok, children }: { ok: boolean | null; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      {ok === true ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
      ) : ok === false ? (
        <Circle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
      ) : (
        <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />
      )}
      <span className={ok === true ? "text-foreground" : undefined}>{children}</span>
    </li>
  );
}
