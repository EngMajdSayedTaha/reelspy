import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getQuizNicheChips } from "@/lib/onboarding/niche-chips";
import { brandVoiceFilled } from "@/lib/onboarding/state";
import type { BrandVoice } from "@/lib/ai/brand-voice";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { getSidebarUser } from "@/lib/user/sidebar-user";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const [user, authResult] = await Promise.all([getSidebarUser(), supabase.auth.getUser()]);
  const authUser = authResult.data.user;

  let showQuiz = false;
  let quizNicheChips: string[] = [];
  let tourCompleted = true;

  if (authUser) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("quiz_completed_at, tour_completed_at, onboarded_at, brand_voice")
      .eq("id", authUser.id)
      .maybeSingle();

    const brandVoice = (profile?.brand_voice as BrandVoice | null) ?? null;
    // Brand-new users only: anyone who's completed/skipped the quiz, has a
    // brand voice already, or finished the full wizard never sees it again.
    showQuiz =
      !profile?.quiz_completed_at && !brandVoiceFilled(brandVoice) && !profile?.onboarded_at;
    tourCompleted = Boolean(profile?.tour_completed_at);

    if (showQuiz) {
      quizNicheChips = await getQuizNicheChips(createAdminClient());
    }
  }

  return (
    <DashboardShell
      user={user}
      showQuiz={showQuiz}
      quizNicheChips={quizNicheChips}
      tourCompleted={tourCompleted}
    >
      {children}
    </DashboardShell>
  );
}
