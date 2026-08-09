import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getQuizNicheChips } from "@/lib/onboarding/niche-chips";
import { brandVoiceFilled } from "@/lib/onboarding/state";
import type { BrandVoice } from "@/lib/ai/brand-voice";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { ColorThemeSync } from "@/components/theme/ColorThemeSync";
import { getSidebarUser } from "@/lib/user/sidebar-user";
import { getUnseenState } from "@/lib/release/seen";
import { CURRENT_VERSION } from "@/lib/release/version";
import type { Release } from "@/lib/release/types";
import { guardDashboardAccess } from "@/lib/waitlist/guard";
import { PAGES_FLAG_DEFAULT, readPagesFlag } from "@/lib/dashboard/pages-flag";
import { matchDashboardPage, type PagesFlag } from "@/lib/dashboard/pages";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const [user, authResult] = await Promise.all([getSidebarUser(), supabase.auth.getUser()]);
  const authUser = authResult.data.user;

  // Closed-beta gate. A no-op (one tiny lookup) when the waiting list is off,
  // which is the normal state; when it's on, anyone not approved — and not an
  // admin, and not grandfathered in from before the switch was flipped — is
  // redirected to /waitlist instead of seeing the product. Runs before any of
  // the onboarding queries below so a held visitor costs almost nothing.
  await guardDashboardAccess(authUser);

  let showQuiz = false;
  let quizNicheChips: string[] = [];
  let tourCompleted = true;
  let colorTheme: string | null = null;
  let hasUnseenRelease = false;
  let spotlightRelease: Release | null = null;
  let pagesFlag: PagesFlag = PAGES_FLAG_DEFAULT;

  if (authUser) {
    const admin = createAdminClient();
    const [{ data: profile }, flag] = await Promise.all([
      supabase
        .from("profiles")
        .select("quiz_completed_at, tour_completed_at, onboarded_at, brand_voice, color_theme")
        .eq("id", authUser.id)
        .maybeSingle(),
      readPagesFlag(admin),
    ]);
    pagesFlag = flag;

    // Admin's flag:pages switch — hide-from-sidebar is the main ask, but a
    // hidden page must not stay reachable by URL, so bounce direct navigation
    // too. x-pathname is set by middleware.ts (Server Components have no
    // other way to read the current URL). Fails open when the header is
    // absent (e.g. a future route outside the middleware's /dashboard scope)
    // by simply not matching any togglable page.
    const pathname = (await headers()).get("x-pathname");
    const page = pathname ? matchDashboardPage(pathname) : undefined;
    if (page && pagesFlag[page.id] === false) {
      redirect("/dashboard");
    }

    // Fail-open: a missing last_seen_version column resolves to "caught up", so
    // an unapplied migration costs the dot and the popup, never the dashboard.
    const unseen = await getUnseenState(supabase, authUser.id);
    hasUnseenRelease = unseen.hasUnseen;
    spotlightRelease = unseen.shouldSpotlight ? unseen.release : null;

    colorTheme = (profile?.color_theme as string | null) ?? null;

    const brandVoice = (profile?.brand_voice as BrandVoice | null) ?? null;
    // Brand-new users only: anyone who's completed/skipped the quiz, has a
    // brand voice already, or finished the full wizard never sees it again.
    showQuiz =
      !profile?.quiz_completed_at && !brandVoiceFilled(brandVoice) && !profile?.onboarded_at;
    tourCompleted = Boolean(profile?.tour_completed_at);

    if (showQuiz) {
      quizNicheChips = await getQuizNicheChips(admin);
    }
  }

  return (
    <DashboardShell
      user={user}
      showQuiz={showQuiz}
      quizNicheChips={quizNicheChips}
      tourCompleted={tourCompleted}
      version={CURRENT_VERSION}
      hasUnseenRelease={hasUnseenRelease}
      spotlightRelease={spotlightRelease}
      pagesFlag={pagesFlag}
    >
      <ColorThemeSync dbTheme={colorTheme} />
      {children}
    </DashboardShell>
  );
}
