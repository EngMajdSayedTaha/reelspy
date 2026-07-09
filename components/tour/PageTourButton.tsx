"use client";

import { HelpCircle } from "lucide-react";
import { useTour } from "@/components/tour/AppTour";
import { useDict } from "@/lib/i18n/I18nProvider";
import { buildPageTourSteps, type PageTourKey } from "@/lib/tour/pageSteps";

type Props = { page: PageTourKey };

// "?" icon placed beside a page's <h1>, launching a driver.js tour scoped to
// that page's own sections (see lib/tour/pageSteps.ts). Distinct from the
// TopBar's tour button, which re-runs the site-wide onboarding tour.
export function PageTourButton({ page }: Props) {
  const dict = useDict();
  const { startPageTour } = useTour();

  return (
    <button
      type="button"
      onClick={() => startPageTour(buildPageTourSteps(page, dict))}
      aria-label={dict.tour.pageHelp}
      title={dict.tour.pageHelp}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground"
    >
      <HelpCircle className="h-4 w-4" />
    </button>
  );
}
