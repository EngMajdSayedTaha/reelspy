"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { QuizModal } from "@/components/onboarding/QuizModal";
import { TourProvider } from "@/components/tour/AppTour";
import { TourInviteToast } from "@/components/tour/TourInviteToast";
import { WhatsNewDialog } from "@/components/release/WhatsNewDialog";
import type { SidebarUser } from "@/lib/user/sidebar-user";
import type { Release } from "@/lib/release/types";

export function DashboardShell({
  children,
  user,
  showQuiz,
  quizNicheChips,
  tourCompleted,
  version,
  hasUnseenRelease,
  spotlightRelease,
}: {
  children: ReactNode;
  user: SidebarUser | null;
  showQuiz: boolean;
  quizNicheChips: string[];
  tourCompleted: boolean;
  version: string;
  hasUnseenRelease: boolean;
  /** Non-null only when an unseen release is worth interrupting for. */
  spotlightRelease: Release | null;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  return (
    <ConfirmProvider>
      <TourProvider
        onOpenSidebar={() => setSidebarOpen(true)}
        onCloseSidebar={() => setSidebarOpen(false)}
      >
        <div className="min-h-screen bg-background text-foreground">
          <Sidebar
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            user={user}
            version={version}
            hasUnseenRelease={hasUnseenRelease}
          />
          {/* logical margin so the RTL sidebar sits on the correct side */}
          <main className="min-h-screen lg:ms-[240px]">
            <TopBar onMenu={() => setSidebarOpen(true)} />
            {/* Keyed by route so every page entrance replays the fade-up.
                `overflow-x-clip` + `min-w-0` are a mobile safety net: no page can
                push the layout wider than the viewport (which on phones shows up
                as content squeezed to one side with empty space beside it).
                `clip` (not `hidden`) keeps sticky descendants working. */}
            <section
              key={pathname}
              className="animate-rise min-w-0 overflow-x-clip p-4 sm:p-6 lg:p-8"
            >
              {children}
            </section>
          </main>
        </div>

        {/* One interruption at a time, in order of how much the user needs it:
            the onboarding quiz outranks release news, and release news outranks
            the tour invite (which is only a toast, but two things asking for
            attention at once is how both get ignored). */}
        {showQuiz ? <QuizModal nicheChips={quizNicheChips} /> : null}
        {!showQuiz && spotlightRelease ? <WhatsNewDialog release={spotlightRelease} /> : null}
        {!showQuiz && !spotlightRelease && !tourCompleted ? <TourInviteToast /> : null}
      </TourProvider>
    </ConfirmProvider>
  );
}
