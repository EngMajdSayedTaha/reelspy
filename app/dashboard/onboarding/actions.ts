"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { track } from "@/lib/analytics/track";
import { resolveUserTier } from "@/lib/ai/tier";
import { limitFor, isUnlimited } from "@/lib/billing/entitlements";
import type { BrandVoice } from "@/lib/ai/claude";

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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized." };

  const brandVoice: BrandVoice = {
    niche: readField(formData, "niche"),
    audience: readField(formData, "audience"),
    offer: readField(formData, "offer"),
    tone: readField(formData, "tone"),
    language: readField(formData, "language"),
  };

  if (!brandVoice.niche && !brandVoice.audience) {
    return { error: "Tell us at least your niche and who you're talking to." };
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized." };

  const tier = await resolveUserTier(supabase, user.id);
  const cap = limitFor(tier, "accounts");

  const { count: usedCount } = await supabase
    .from("inspiration_accounts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  const used = usedCount ?? 0;
  const remaining = isUnlimited(cap) ? 12 : Math.max(0, cap - used);
  if (remaining === 0) {
    return { error: "You've reached your plan's tracked-account limit." };
  }

  // Pick the most-followed successfully-cached accounts as a sensible default
  // pack. Cap at the smaller of the suggested pack size and remaining slots.
  const packSize = Math.min(remaining, 5);
  const { data: snapshots } = await supabase
    .from("ig_account_snapshots")
    .select("ig_username, display_name, followers_count, avatar_url")
    .eq("last_status", "ok")
    .order("followers_count", { ascending: false, nullsFirst: false })
    .limit(packSize);

  if (!snapshots || snapshots.length === 0) {
    return { error: "No starter accounts are available yet — connect Instagram or add accounts manually." };
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
    return { error: "You already track the starter accounts." };
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
