import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listNiches } from "@/lib/trends/niche";
import { brandVoiceFilled } from "@/lib/onboarding/state";
import type { BrandVoice } from "@/lib/ai/brand-voice";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { getSidebarUser } from "@/lib/user/sidebar-user";

// Curated fallback niches so the quiz's chip row isn't empty on a brand-new
// deployment, before any Niche Radar aggregate data exists (account_groups).
const CURATED_NICHES = [
  "real estate",
  "fitness",
  "beauty",
  "fashion",
  "food",
  "finance",
  "travel",
  "tech",
];

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
      const admin = createAdminClient();
      const niches = await listNiches(admin, { limit: 12 }).catch(() => []);
      quizNicheChips = [...new Set([...niches.map((n) => n.niche), ...CURATED_NICHES])].slice(0, 10);
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
