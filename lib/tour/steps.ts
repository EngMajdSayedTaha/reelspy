// Step list for the driver.js product tour (components/tour/AppTour.tsx).
// Selector-based (data-tour attributes) rather than refs, so the same list
// works regardless of which page the user is on.
//
// Every step anchors on a sidebar nav item — the one part of the app that's
// present on *every* dashboard page. That's deliberate: the onboarding tour
// must be identical and complete no matter where the user starts it from.
// Page-specific detail lives in the per-page "?" tours (lib/tour/pageSteps.ts).
// On mobile the sidebar is a drawer, so TourProvider opens it before driving
// the tour (and closes it afterwards) — the *steps* are the same on every
// viewport, only the drawer handling differs.

import type { Dict } from "@/lib/i18n/dictionaries";

export type TourStep = {
  element: string;
  title: string;
  description: string;
};

export function buildTourSteps(dict: Dict["tour"]): TourStep[] {
  const s = dict.steps;

  // Top-to-bottom in the same order as the sidebar nav, so the highlight
  // walks the menu without jumping around.
  return [
    { element: '[data-tour="nav-dashboard"]', title: s.dashboard.title, description: s.dashboard.desc },
    { element: '[data-tour="nav-accounts"]', title: s.accounts.title, description: s.accounts.desc },
    { element: '[data-tour="nav-feed"]', title: s.feed.title, description: s.feed.desc },
    { element: '[data-tour="nav-trends"]', title: s.trends.title, description: s.trends.desc },
    { element: '[data-tour="nav-hooks"]', title: s.hooks.title, description: s.hooks.desc },
    { element: '[data-tour="nav-scripts"]', title: s.scripts.title, description: s.scripts.desc },
    { element: '[data-tour="nav-my-account"]', title: s.myIg.title, description: s.myIg.desc },
    { element: '[data-tour="nav-automations"]', title: s.automations.title, description: s.automations.desc },
    { element: '[data-tour="nav-publishing"]', title: s.publishing.title, description: s.publishing.desc },
    { element: '[data-tour="nav-calendar"]', title: s.calendar.title, description: s.calendar.desc },
    { element: '[data-tour="nav-connections"]', title: s.connections.title, description: s.connections.desc },
    { element: '[data-tour="nav-billing"]', title: s.billing.title, description: s.billing.desc },
    { element: '[data-tour="nav-settings"]', title: s.settings.title, description: s.settings.desc },
  ];
}
