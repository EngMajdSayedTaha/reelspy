import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BrandVoice } from "@/lib/ai/claude";

// Onboarding progress (B3 / L7). Step completion is INFERRED from real data —
// IG connection, brand voice, tracked accounts, synced reels, first script —
// rather than stored, so the wizard is always consistent with the user's actual
// state even if they do steps out of band (e.g. connect IG from Settings). The
// only persisted bit is profiles.onboarded_at, the "I'm done / dismissed" marker.

export type OnboardingSteps = {
  /** IG Business account connected (or the user took the starter-pack path). */
  source: boolean;
  /** brand_voice has at least a niche or audience filled in. */
  brandVoice: boolean;
  /** At least one inspiration account tracked. */
  accounts: boolean;
  /** At least one reel synced into the feed. */
  synced: boolean;
  /** At least one script generated — the activation event. */
  firstScript: boolean;
};

export type OnboardingState = {
  steps: OnboardingSteps;
  accountsCount: number;
  reelsCount: number;
  scriptsCount: number;
  connected: boolean;
  onboardedAt: string | null;
  /** User finished or dismissed the wizard (onboarded_at set). */
  complete: boolean;
  /** The real activation signal — a first script exists. */
  activated: boolean;
  /** 1..4: the first unfinished wizard step (4 = generate/done). */
  currentStep: 1 | 2 | 3 | 4;
  /** How many of the 4 steps are done, for the progress meter. */
  completedCount: number;
};

// The suggested number of accounts to add in step 3 (the wizard nudges toward
// this, but a single account is enough to progress).
export const SUGGESTED_ACCOUNTS = 3;

function brandVoiceFilled(bv: BrandVoice | null | undefined): boolean {
  if (!bv) return false;
  return Boolean((bv.niche && bv.niche.trim()) || (bv.audience && bv.audience.trim()));
}

export async function getOnboardingState(
  supabase: SupabaseClient,
  userId: string
): Promise<OnboardingState> {
  const [{ data: profile }, accountsRes, reelsRes, scriptsRes] = await Promise.all([
    supabase.from("profiles").select("ig_user_id, brand_voice, onboarded_at").eq("id", userId).maybeSingle(),
    supabase.from("inspiration_accounts").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("tracked_reels").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("generated_scripts").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);

  const accountsCount = accountsRes.count ?? 0;
  const reelsCount = reelsRes.count ?? 0;
  const scriptsCount = scriptsRes.count ?? 0;
  const connected = Boolean(profile?.ig_user_id);
  const onboardedAt = (profile?.onboarded_at as string | null) ?? null;

  const steps: OnboardingSteps = {
    // Either a real IG connection or the starter-pack path (which seeds accounts
    // without one) satisfies the "pick a data source" step.
    source: connected || accountsCount > 0,
    brandVoice: brandVoiceFilled(profile?.brand_voice as BrandVoice | null),
    accounts: accountsCount > 0,
    synced: reelsCount > 0,
    firstScript: scriptsCount > 0,
  };

  // The 4 wizard steps, in order: source → brand voice → accounts → generate.
  // (Sync is folded into the generate step — it happens automatically there.)
  const stepDone = [steps.source, steps.brandVoice, steps.accounts, steps.firstScript];
  const completedCount = stepDone.filter(Boolean).length;
  const firstUnfinished = stepDone.findIndex((d) => !d);
  const currentStep = (firstUnfinished === -1 ? 4 : firstUnfinished + 1) as 1 | 2 | 3 | 4;

  return {
    steps,
    accountsCount,
    reelsCount,
    scriptsCount,
    connected,
    onboardedAt,
    complete: onboardedAt != null,
    activated: steps.firstScript,
    currentStep,
    completedCount,
  };
}
