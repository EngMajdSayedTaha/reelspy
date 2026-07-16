// Step list for the driver.js product tour (components/tour/AppTour.tsx).
// Selector-based (data-tour attributes) rather than refs, so the same list
// works regardless of where the target lives in the tree. Filtered at start
// time by BOTH viewport (desktop-only sidebar steps — the mobile sidebar is
// still in the DOM, just translated off-canvas) and DOM presence (e.g.
// SetupChecklist only renders for not-yet-activated users).

import type { Dict } from "@/lib/i18n/dictionaries";

export type TourStep = {
  element: string;
  title: string;
  description: string;
};

export function buildTourSteps(dict: Dict["tour"], isDesktop: boolean): TourStep[] {
  const steps: TourStep[] = [];

  if (isDesktop) {
    // Same top-to-bottom order as the sidebar nav so the highlight walks the
    // menu without jumping around.
    steps.push(
      { element: '[data-tour="nav-accounts"]', title: dict.steps.accounts.title, description: dict.steps.accounts.desc },
      { element: '[data-tour="nav-feed"]', title: dict.steps.feed.title, description: dict.steps.feed.desc },
      { element: '[data-tour="nav-trends"]', title: dict.steps.trends.title, description: dict.steps.trends.desc },
      { element: '[data-tour="nav-scripts"]', title: dict.steps.scripts.title, description: dict.steps.scripts.desc },
      { element: '[data-tour="nav-my-account"]', title: dict.steps.myIg.title, description: dict.steps.myIg.desc }
    );
  } else {
    steps.push({
      element: '[data-tour="topbar-menu"]',
      title: dict.steps.menu.title,
      description: dict.steps.menu.desc,
    });
  }

  steps.push(
    {
      element: '[data-tour="quick-actions"]',
      title: dict.steps.quickActions.title,
      description: dict.steps.quickActions.desc,
    },
    {
      element: '[data-tour="setup-checklist"]',
      title: dict.steps.checklist.title,
      description: dict.steps.checklist.desc,
    }
  );

  return steps;
}
