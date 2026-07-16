"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useTour } from "@/components/tour/AppTour";
import { completeTour } from "@/app/dashboard/onboarding/actions";
import { useDict } from "@/lib/i18n/I18nProvider";

const SHOWN_KEY = "reelspy.tour.invite_shown";

// Opt-in replacement for the old auto-starting tour: mounted in DashboardShell
// once the quiz is out of the way and the tour hasn't been completed/skipped.
// Fires a single toast per browser session (sessionStorage + ref guard against
// StrictMode's double-invoke) rather than gating on a DB write.
export function TourInviteToast() {
  const dict = useDict().tour;
  const { startTour } = useTour();
  const shownRef = useRef(false);

  useEffect(() => {
    if (shownRef.current || window.sessionStorage.getItem(SHOWN_KEY)) return;
    shownRef.current = true;
    window.sessionStorage.setItem(SHOWN_KEY, "1");

    const timer = setTimeout(() => {
      toast(dict.inviteTitle, {
        duration: 15000,
        action: { label: dict.inviteAction, onClick: () => startTour() },
        cancel: { label: dict.inviteDismiss, onClick: () => void completeTour() },
      });
    }, 600);
    return () => clearTimeout(timer);
  }, [dict, startTour]);

  return null;
}
