"use client";

import { useState, useTransition } from "react";
import { Check, Plus } from "lucide-react";
import { toast } from "sonner";
import { trackNicheAccount } from "@/app/dashboard/trends/actions";
import { useDict } from "@/lib/i18n/I18nProvider";

type Props = {
  username: string;
  niche?: string;
  /** True when the user already tracks this account. */
  initialTracked: boolean;
  /** Attribution for app_events (e.g. "suggestions" vs the default "niche_radar"). */
  source?: string;
};

// "Track account" for a niche-radar card (X3). Turns cross-user discovery into
// the user's own research funnel — seeds from the shared snapshot cache (no Meta
// quota). Optimistic: flips to "Tracking" on success, reverts + toasts on error.
export function TrackAccountButton({ username, niche, initialTracked, source }: Props) {
  const fullDict = useDict();
  const dict = fullDict.trends.track;
  const [tracked, setTracked] = useState(initialTracked);
  const [isPending, startTransition] = useTransition();

  if (tracked) {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg bg-success/10 px-2.5 py-1.5 text-xs font-medium text-success">
        <Check className="h-3.5 w-3.5" /> {dict.tracking}
      </span>
    );
  }

  const track = () => {
    startTransition(async () => {
      const result = await trackNicheAccount(username, niche, source);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setTracked(true);
      toast.success(dict.trackingToast(username));
    });
  };

  return (
    <button
      type="button"
      onClick={track}
      disabled={isPending}
      className="inline-flex items-center gap-1 rounded-lg border border-border-strong bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-foreground transition hover:border-primary/60 hover:text-brand disabled:opacity-60"
    >
      <Plus className="h-3.5 w-3.5" /> {isPending ? dict.adding : fullDict.common.track}
    </button>
  );
}
