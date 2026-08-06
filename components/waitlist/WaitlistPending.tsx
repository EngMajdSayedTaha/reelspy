"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Clock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useDict } from "@/lib/i18n/I18nProvider";

// "You're #47 in line." The screen a signed-in but not-yet-approved account
// sees instead of the dashboard.
//
// It shows a real, moving number rather than a vague "we'll be in touch":
// `ahead` counts only PENDING entries ahead of them, so it shrinks every time a
// batch is let in — which is the one thing that makes waiting feel like
// progress instead of like being ignored.

export function WaitlistPending({
  email,
  queueNumber,
  ahead,
  total,
}: {
  email: string | null;
  queueNumber: number | null;
  ahead: number;
  total: number;
}) {
  const router = useRouter();
  const t = useDict().waitlist;
  const [refreshing, setRefreshing] = useState(false);

  const refresh = () => {
    setRefreshing(true);
    // A server-component refresh: re-runs the page, which re-reads the gate. If
    // they've been approved since, the page itself redirects to /dashboard.
    router.refresh();
    setTimeout(() => setRefreshing(false), 1200);
  };

  const signOut = async () => {
    try {
      await createClient().auth.signOut();
    } catch {
      // Signing out is best-effort; the navigation below is what matters.
    }
    window.location.assign("/login");
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2 text-center">
        <Clock className="mx-auto h-10 w-10 text-brand" aria-hidden />
        <h2 className="text-lg font-semibold text-foreground">{t.pendingHeading}</h2>
        <p className="text-sm text-subtle">{t.pendingSub}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-secondary/40 p-3 text-center">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t.positionLabel}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {queueNumber != null ? t.ticketLabel(queueNumber) : "—"}
          </p>
          <p className="mt-0.5 text-xs text-subtle">{t.aheadLabel(ahead)}</p>
        </div>
        <div className="rounded-lg border border-border bg-secondary/40 p-3 text-center">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t.totalLabel}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{total}</p>
        </div>
      </div>

      <div className="rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold text-foreground">{t.whatNextHeading}</h3>
        <ul className="mt-2 space-y-1.5 text-sm text-subtle">
          <li>· {t.whatNext1}</li>
          <li>· {t.whatNext2}</li>
          <li>· {t.whatNext3}</li>
        </ul>
      </div>

      <Button className="w-full" onClick={refresh} disabled={refreshing} type="button">
        <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        {t.refresh}
      </Button>

      <p className="text-center text-xs text-subtle">
        {email ? t.signedInAs(email) : null}
        {email ? <span className="mx-2">·</span> : null}
        <button type="button" onClick={() => void signOut()} className="hover:text-foreground hover:underline">
          {t.signOut}
        </button>
      </p>
    </div>
  );
}
