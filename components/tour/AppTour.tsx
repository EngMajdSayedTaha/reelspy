"use client";

import "driver.js/dist/driver.css";
import { createContext, useCallback, useContext, useRef, type ReactNode } from "react";
import { buildTourSteps, type TourStep } from "@/lib/tour/steps";
import { completeTour } from "@/app/dashboard/onboarding/actions";
import { useDict } from "@/lib/i18n/I18nProvider";
import type { Dict } from "@/lib/i18n/dictionaries";

type TourContextValue = { startTour: () => void; startPageTour: (steps: TourStep[]) => void };
const TourContext = createContext<TourContextValue | null>(null);

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within a TourProvider");
  return ctx;
}

type Props = {
  children: ReactNode;
  // Lets the site-wide tour reveal the sidebar on mobile (where it's an
  // off-canvas drawer) so its nav items — every tour step's anchor — are
  // actually on-screen while the tour runs. No-ops on desktop, where the
  // sidebar is always visible.
  onOpenSidebar?: () => void;
  onCloseSidebar?: () => void;
};

const DESKTOP_QUERY = "(min-width: 1024px)";

function isDesktopViewport(): boolean {
  return typeof window !== "undefined" && window.matchMedia(DESKTOP_QUERY).matches;
}

// Wait until `selector` has settled *within* the viewport before driver.js
// measures it. An off-canvas drawer element still reports client rects while
// translated off-screen, so presence alone isn't enough — we wait until its
// horizontal centre is inside the viewport (i.e. the drawer has slid in).
// Resolves early once on-screen, or after `timeout` as a safety net.
function waitForElement(selector: string, timeout = 800): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    const check = () => {
      const el = document.querySelector(selector) as HTMLElement | null;
      if (el) {
        const rect = el.getBoundingClientRect();
        const centreX = rect.left + rect.width / 2;
        const onScreen = rect.width > 0 && centreX >= 0 && centreX <= window.innerWidth;
        if (onScreen) {
          resolve();
          return;
        }
      }
      if (performance.now() - start > timeout) {
        resolve();
        return;
      }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
}

// Shared by both the global (site-wide) tour and per-page tours — builds and
// drives one driver.js instance. Per-page tours pass no onDestroyed (or one
// that skips completeTour()) since they're manual/on-demand, not gated.
async function runDriverTour(steps: TourStep[], dict: Dict, onDestroyed: () => void) {
  const { driver } = await import("driver.js");
  const instance = driver({
    showProgress: true,
    allowClose: true,
    nextBtnText: dict.tour.next,
    prevBtnText: dict.tour.prev,
    doneBtnText: dict.tour.done,
    progressText: dict.tour.progress,
    steps: steps.map((s) => ({
      element: s.element,
      popover: { title: s.title, description: s.description },
    })),
    onDestroyed,
  });
  instance.drive();
}

// Guided product tour (driver.js — MIT, ~5kB gzip, zero deps). Mounted once in
// DashboardShell so the TopBar re-launch button and the opt-in tour-invite
// toast (TourInviteToast) share one controller. driver.js's JS is dynamically
// imported on first start so it never inflates the dashboard's initial
// bundle; only its small base CSS (positioning/arrows) loads eagerly — visual
// restyling lives in app/globals.css's .driver-popover overrides.
export function TourProvider({ children, onOpenSidebar, onCloseSidebar }: Props) {
  const dict = useDict();
  const startedRef = useRef(false);

  const startTour = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    void (async () => {
      // Every step anchors on a sidebar nav item. On mobile the sidebar is an
      // off-canvas drawer, so open it first and wait for it to slide in before
      // driver.js measures anything — otherwise it would position popovers over
      // collapsed elements. On desktop the drawer callbacks no-op.
      const onDrawer = !isDesktopViewport();
      if (onDrawer) {
        onOpenSidebar?.();
        await waitForElement('[data-tour="nav-dashboard"]');
      }

      const steps = buildTourSteps(dict.tour).filter((s) => document.querySelector(s.element));

      if (steps.length === 0) {
        if (onDrawer) onCloseSidebar?.();
        startedRef.current = false;
        return;
      }

      await runDriverTour(steps, dict, () => {
        if (onDrawer) onCloseSidebar?.();
        startedRef.current = false;
        void completeTour();
      });
    })();
  }, [dict, onOpenSidebar, onCloseSidebar]);

  // Per-page tour, triggered by the "?" button beside a page's title. Unlike
  // startTour, this never touches tour_completed_at — it's on-demand help,
  // not a gated onboarding flow.
  const startPageTour = useCallback(
    (steps: TourStep[]) => {
      if (startedRef.current) return;
      const visible = steps.filter((s) => document.querySelector(s.element));
      if (visible.length === 0) return;
      startedRef.current = true;
      void runDriverTour(visible, dict, () => {
        startedRef.current = false;
      });
    },
    [dict]
  );

  return (
    <TourContext.Provider value={{ startTour, startPageTour }}>{children}</TourContext.Provider>
  );
}
