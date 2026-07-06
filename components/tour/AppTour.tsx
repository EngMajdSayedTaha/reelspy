"use client";

import "driver.js/dist/driver.css";
import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";
import { buildTourSteps } from "@/lib/tour/steps";
import { completeTour } from "@/app/dashboard/onboarding/actions";
import { useDict } from "@/lib/i18n/I18nProvider";

type TourContextValue = { startTour: () => void };
const TourContext = createContext<TourContextValue | null>(null);

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within a TourProvider");
  return ctx;
}

type Props = {
  children: ReactNode;
  /** True when the server determined this is a fresh mount with no quiz on
   *  top and the tour hasn't been completed/skipped yet. */
  autoStart: boolean;
  tourCompleted: boolean;
};

// Guided product tour (driver.js — MIT, ~5kB gzip, zero deps). Mounted once in
// DashboardShell so the quiz hand-off (QuizModal calls startTour on finish/
// skip) and the TopBar re-launch button share one controller. driver.js's JS
// is dynamically imported on first start so it never inflates the dashboard's
// initial bundle; only its small base CSS (positioning/arrows) loads eagerly —
// visual restyling lives in app/globals.css's .driver-popover overrides.
export function TourProvider({ children, autoStart, tourCompleted }: Props) {
  const dict = useDict();
  const startedRef = useRef(false);

  const startTour = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    void (async () => {
      const { driver } = await import("driver.js");
      const isDesktop =
        typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
      const steps = buildTourSteps(dict.tour, isDesktop).filter((s) =>
        document.querySelector(s.element)
      );

      if (steps.length === 0) {
        startedRef.current = false;
        return;
      }

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
        onDestroyed: () => {
          startedRef.current = false;
          void completeTour();
        },
      });
      instance.drive();
    })();
  }, [dict]);

  useEffect(() => {
    if (!autoStart || tourCompleted) return;
    // Small delay so the dashboard's own entrance animation/layout settles
    // before driver.js measures target positions.
    const timer = setTimeout(() => startTour(), 500);
    return () => clearTimeout(timer);
  }, [autoStart, tourCompleted, startTour]);

  return <TourContext.Provider value={{ startTour }}>{children}</TourContext.Provider>;
}
