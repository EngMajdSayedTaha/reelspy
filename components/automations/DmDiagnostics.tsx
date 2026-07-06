"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Circle, HelpCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ResubscribeResult } from "@/app/dashboard/automations/actions";
import { useDict } from "@/lib/i18n/I18nProvider";

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
  const dict = useDict().automations.diagnostics;
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
          toast.success(dict.toastResubscribedOk);
        } else {
          toast.warning(dict.toastResubscribedWaiting);
        }
      } catch {
        toast.error(dict.toastError);
      }
    });
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-brand" />
          <h3 className="font-semibold text-foreground">{dict.title}</h3>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={run} disabled={isPending}>
          <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
          {isPending ? dict.checking : dict.recheck}
        </Button>
      </div>

      <ul className="space-y-1.5 text-muted-foreground">
        <Item ok={subscribed}>{dict.pageSubscribed}</Item>
        <Item ok={hasMessages}>
          <span>
            <code className="rounded bg-secondary px-1 py-0.5 text-xs">{dict.messagesCode}</code>{" "}
            {dict.messagesFieldActive}
            {hasMessages === null ? dict.messagesFieldWaiting : ""}
          </span>
        </Item>
      </ul>

      <div className="space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">{dict.twoSteps}</p>
        <p>
          {dict.step1Before}{" "}
          <code className="rounded bg-secondary px-1 py-0.5">{dict.step1Field}</code>
          {dict.step1After}
        </p>
        <p>
          {dict.step2Before}{" "}
          <span className="font-medium">{dict.step2Emphasis}</span>
          {dict.step2After}
        </p>
      </div>
    </div>
  );
}

function Item({ ok, children }: { ok: boolean | null; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      {ok === true ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
      ) : ok === false ? (
        <Circle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
      ) : (
        <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />
      )}
      <span className={ok === true ? "text-foreground" : undefined}>{children}</span>
    </li>
  );
}
