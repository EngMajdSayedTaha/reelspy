// Shared niche-chip fetcher for the quiz (components/onboarding/QuizModal.tsx),
// used both on first render (app/dashboard/layout.tsx) and when re-opened from
// Settings (components/settings/QuizSettingsSection.tsx) to edit answers.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listNiches } from "@/lib/trends/niche";

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

export async function getQuizNicheChips(admin: SupabaseClient, limit = 12): Promise<string[]> {
  const niches = await listNiches(admin, { limit }).catch(() => []);
  return [...new Set([...niches.map((n) => n.niche), ...CURATED_NICHES])].slice(0, 10);
}
