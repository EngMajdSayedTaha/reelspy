import { Info } from "lucide-react";
import { SUPPORT_EMAIL } from "@/lib/email/layout";
import type { ConnectionsDict } from "@/lib/i18n/dictionaries/connections";

type Props = {
  dict: ConnectionsDict["connections"]["betaGate"];
};

// Shown above the Instagram card while the Meta app is still in Development
// mode (META_BETA_MODE=true — see .env.example and
// Plan_Reelspy/09-platform-access.md Phase 0).
//
// This exists because there is no error to react to: a Facebook account
// without a Tester/Developer/Admin role on the app that clicks Connect anyway
// lands on Facebook's own "App Not Active" interstitial, which never redirects
// back to /api/ig/callback. Nothing is logged, nothing shows up as an error
// here — from the outside it's indistinguishable from a frozen page. The only
// fix is explaining the tester-invite step BEFORE the click, not after.
export function BetaTesterGate({ dict }: Props) {
  return (
    <div className="rounded-2xl border border-info/40 bg-info/10 p-5 text-sm text-foreground">
      <div className="flex items-start gap-3">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-info" />
        <div className="space-y-3">
          <div>
            <p className="font-semibold">{dict.heading}</p>
            <p className="mt-1 text-muted-foreground">{dict.body}</p>
          </div>

          <div>
            <p className="font-medium">{dict.stepsHeading}</p>
            <ol className="mt-1 list-decimal space-y-1 ps-5 text-muted-foreground">
              {dict.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>

          <p className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
            {dict.noInviteYet}
            <a
              className="font-medium text-accent-brand hover:underline"
              href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(dict.requestAccessSubject)}`}
            >
              {dict.requestAccess}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
