"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { track } from "@/lib/analytics/track";
import { resolveUserEntitlements } from "@/lib/billing/resolve";
import { limitOf, isUnlimited } from "@/lib/billing/entitlements";
import { isArabicDialect, type ArabicDialect, type BrandVoice } from "@/lib/ai/brand-voice";
import { listNiches } from "@/lib/trends/niche";
import { resolveNicheSlug } from "@/lib/suggestions/accounts";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { getDictionary } from "@/lib/i18n/dictionaries";

export type OnboardingActionState = { error?: string; ok?: boolean };

// Per-field caps mirror the interpolation caps in lib/ai/claude.ts so a long
// answer can't bloat every AI prompt (and the jsonb row). `creator` is derived
// elsewhere (IG handle / username), not collected here, so it's not listed.
const FIELD_CAPS = {
  niche: 120,
  audience: 160,
  offer: 200,
  tone: 120,
  language: 60,
} as const;

type VoiceField = keyof typeof FIELD_CAPS;

function readField(formData: FormData, key: VoiceField): string | null {
  const raw = formData.get(key);
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, FIELD_CAPS[key]);
  return trimmed || null;
}

// Step 2: save the brand voice (feeds B2's per-user AI persona). Stored as jsonb
// with only the fields the user actually filled in; an all-empty submit is an
// error so the step can't be "completed" with nothing.
export async function saveBrandVoice(
  _prev: OnboardingActionState,
  formData: FormData
): Promise<OnboardingActionState> {
  const { locale } = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  const dict = getDictionary(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: dict.onboarding.unauthorized };

  const dialectRaw = formData.get("arabicDialect");
  const brandVoice: BrandVoice = {
    niche: readField(formData, "niche"),
    audience: readField(formData, "audience"),
    offer: readField(formData, "offer"),
    tone: readField(formData, "tone"),
    language: readField(formData, "language"),
    // Arabic-first preset (X2): only persist a recognized dialect, else clear it.
    arabicDialect: isArabicDialect(dialectRaw) ? dialectRaw : null,
  };

  if (!brandVoice.niche && !brandVoice.audience) {
    return { error: dict.onboarding.tellUsNicheAndAudience };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ brand_voice: brandVoice })
    .eq("id", user.id);

  if (error) return { error: error.message };

  await track(user.id, "onboarding_step", { step: "brand_voice" });
  revalidatePath("/dashboard/onboarding");
  revalidatePath("/dashboard");
  return { ok: true };
}

export type StarterPackState = { error?: string; added?: number };

// Step 1 (skip branch): seed inspiration accounts from the GLOBAL snapshot cache
// (ig_account_snapshots) — accounts already fetched by other users, so this costs
// ZERO Meta quota and needs no IG connection. Trimmed to the plan's account cap.
export async function seedStarterPack(): Promise<StarterPackState> {
  const { locale } = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  const dict = getDictionary(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: dict.onboarding.unauthorized };

  const { tier, entitlements } = await resolveUserEntitlements(supabase, user.id);
  const cap = limitOf(entitlements, "accounts");

  const { count: usedCount } = await supabase
    .from("inspiration_accounts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  const used = usedCount ?? 0;
  const remaining = isUnlimited(cap) ? 12 : Math.max(0, cap - used);
  if (remaining === 0) {
    // Name the actual plan + limit (same copy as the manual add-account path)
    // instead of a generic "limit reached" — the wizard UI should stop
    // offering this button once atCap, but keep the message actionable as a
    // fallback (e.g. a stale page from another tab).
    return { error: dict.accounts.actions.accountLimit(dict.billing.plans[tier].name, cap) };
  }

  // ig_account_snapshots is RLS-locked with no policies (service-role only —
  // see migration 20260610000001), so it must be read through the admin
  // client. The user-scoped client always sees zero rows here regardless of
  // how much is actually cached.
  const admin = createAdminClient();

  // Pick the most-followed successfully-cached accounts as a sensible default
  // pack. Cap at the smaller of the suggested pack size and remaining slots.
  const packSize = Math.min(remaining, 5);
  const { data: snapshots } = await admin
    .from("ig_account_snapshots")
    .select("ig_username, display_name, followers_count, avatar_url")
    .eq("last_status", "ok")
    .order("followers_count", { ascending: false, nullsFirst: false })
    .limit(packSize);

  if (!snapshots || snapshots.length === 0) {
    return { error: dict.onboarding.noStarterAccountsAvailable };
  }

  // Skip any the user already tracks.
  const { data: existing } = await supabase
    .from("inspiration_accounts")
    .select("ig_username")
    .eq("user_id", user.id)
    .in(
      "ig_username",
      snapshots.map((s) => s.ig_username)
    );
  const existingSet = new Set((existing ?? []).map((r) => r.ig_username));
  const fresh = snapshots.filter((s) => !existingSet.has(s.ig_username));

  if (fresh.length === 0) {
    return { error: dict.onboarding.alreadyTrackStarterAccounts };
  }

  const { error } = await supabase.from("inspiration_accounts").insert(
    fresh.map((s) => ({
      user_id: user.id,
      ig_username: s.ig_username,
      display_name: s.display_name ?? s.ig_username,
      followers_count: s.followers_count ?? null,
      avatar_url: s.avatar_url ?? null,
      is_active: true,
    }))
  );
  if (error) return { error: error.message };

  await track(user.id, "account_added", { bulk: true, count: fresh.length, source: "starter_pack" });
  await track(user.id, "onboarding_step", { step: "starter_pack", count: fresh.length });
  revalidatePath("/dashboard/onboarding");
  revalidatePath("/dashboard/accounts");
  revalidatePath("/dashboard/feed");
  return { added: fresh.length };
}

// Mark the wizard finished / dismissed. Idempotent — sets onboarded_at once.
export async function finishOnboarding(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("profiles")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("id", user.id)
    .is("onboarded_at", null);

  await track(user.id, "onboarding_step", { step: "complete" });
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/onboarding");
}

export type QuizAnswers = {
  niche: string;
  audience?: string | null;
  offer?: string | null;
  tone?: string | null;
  language?: string | null;
  arabicDialect?: ArabicDialect | null;
};

// One-time onboarding quiz popup (replaces the auto-redirect into the full
// wizard for brand-new users — see app/dashboard/page.tsx). Read-merge-writes
// brand_voice like saveBrandVoice above, then resolves the niche onto the
// Niche Radar taxonomy ONCE here so the suggestion engine never re-runs the
// AI/string match on every page load (lib/suggestions/accounts.ts).
export async function completeQuiz(answers: QuizAnswers): Promise<OnboardingActionState> {
  const { locale } = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  const dict = getDictionary(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: dict.onboarding.unauthorized };

  const niche = answers.niche.trim().slice(0, FIELD_CAPS.niche);
  if (!niche) return { error: dict.onboarding.tellUsNicheAndAudience };

  const { data: existing } = await supabase
    .from("profiles")
    .select("brand_voice")
    .eq("id", user.id)
    .maybeSingle();
  const current = (existing?.brand_voice as BrandVoice | null) ?? {};

  const brandVoice: BrandVoice = {
    ...current,
    niche,
    audience: answers.audience?.trim().slice(0, FIELD_CAPS.audience) || current.audience || null,
    offer: answers.offer?.trim().slice(0, FIELD_CAPS.offer) || current.offer || null,
    tone: answers.tone?.trim().slice(0, FIELD_CAPS.tone) || current.tone || null,
    language: answers.language?.trim().slice(0, FIELD_CAPS.language) || current.language || null,
    arabicDialect: isArabicDialect(answers.arabicDialect)
      ? answers.arabicDialect
      : (current.arabicDialect ?? null),
  };

  const admin = createAdminClient();
  const niches = await listNiches(admin).catch(() => []);
  const nicheSlug = await resolveNicheSlug(niche, niches);

  const { error } = await supabase
    .from("profiles")
    .update({
      brand_voice: brandVoice,
      quiz_completed_at: new Date().toISOString(),
      niche_slug: nicheSlug,
    })
    .eq("id", user.id);
  if (error) return { error: error.message };

  await track(user.id, "quiz_completed", { niche, nicheSlug });
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/accounts");
  return { ok: true };
}

// Skip the quiz. Idempotent — the popup must never reappear once dismissed.
export async function dismissQuiz(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("profiles")
    .update({ quiz_completed_at: new Date().toISOString() })
    .eq("id", user.id)
    .is("quiz_completed_at", null);

  await track(user.id, "quiz_skipped");
  revalidatePath("/dashboard");
}

// Mark the product tour finished / skipped. driver.js's onDestroyed fires for
// both, so this is one-shot either way — idempotent like the other markers.
export async function completeTour(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("profiles")
    .update({ tour_completed_at: new Date().toISOString() })
    .eq("id", user.id)
    .is("tour_completed_at", null);

  await track(user.id, "tour_completed");
}
