"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Clock, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useDict } from "@/lib/i18n/I18nProvider";
import type { WaitlistStatus } from "@/lib/waitlist/entry";

// The screen a signed-in but not-yet-approved account sees instead of the
// dashboard. Two shapes, by status:
//
//   pending/invited  "You're #47 in line" — a real, moving number rather than
//                     a vague "we'll be in touch". `ahead` counts only PENDING
//                     entries ahead of them, so it shrinks as batches go in.
//   rejected          A distinct, honest screen. This used to fall through to
//                     the exact same "you're on the list, waiting for
//                     approval" copy as pending — a declined applicant saw no
//                     difference and had no way to know a decision had even
//                     been made. Only queue stats and the "what happens next"
//                     bullets are wrong for this state; sign-out and "check
//                     again" (an admin can always reverse a decision) stay.

export function WaitlistPending({
  email,
  status,
  queueNumber,
  ahead,
  total,
}: {
  email: string | null;
  status: WaitlistStatus;
  queueNumber: number | null;
  ahead: number;
  total: number;
}) {
  const router = useRouter();
  const t = useDict().waitlist;
  const [refreshing, setRefreshing] = useState(false);
  const rejected = status === "rejected";

  const refresh = () => {
    setRefreshing(true);
    // A server-component refresh: re-runs the page, which re-reads the gate. If
    // their status has changed since, the page itself redirects to /dashboard.
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
        {rejected ? (
          <XCircle className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden />
        ) : (
          <Clock className="mx-auto h-10 w-10 text-brand" aria-hidden />
        )}
        <h2 className="text-lg font-semibold text-foreground">
          {rejected ? t.rejectedHeading : t.pendingHeading}
        </h2>
        <p className="text-sm text-subtle">{rejected ? t.rejectedBody : t.pendingSub}</p>
      </div>

      {!rejected ? (
        <>
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
        </>
      ) : null}

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
