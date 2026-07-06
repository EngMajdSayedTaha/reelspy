"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidIgUsername } from "@/lib/instagram/graph-api";
import { track } from "@/lib/analytics/track";
import { resolveUserTier } from "@/lib/ai/tier";
import { limitFor, withinLimit } from "@/lib/billing/entitlements";
import { ALL_NICHES, slugifyNiche } from "@/lib/trends/shared";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { getDictionary } from "@/lib/i18n/dictionaries";

export type TrackAccountState = { ok?: boolean; tracked?: boolean; error?: string };

// Track a niche-radar account (X3). The account is already in the shared
// snapshot cache, so we seed inspiration_accounts from it directly — ZERO Meta
// quota, no Business Discovery call (unlike accounts/addInspirationAccount).
// Optionally files it under a group named for the niche so the user's own feed
// inherits the categorization. Cap-enforced like every other add path (L6).
export async function trackNicheAccount(
  username: string,
  niche?: string
): Promise<TrackAccountState> {
  const { locale } = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  const fullDict = getDictionary(locale);
  const dict = fullDict.trends.track;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: dict.unauthorized };

  const ig = username.trim().replace(/^@+/, "").toLowerCase();
  if (!isValidIgUsername(ig)) return { error: dict.invalidUsername };

  // Already tracking? Idempotent success — the card just flips to "Tracking".
  const { data: existing } = await supabase
    .from("inspiration_accounts")
    .select("id")
    .eq("user_id", user.id)
    .eq("ig_username", ig)
    .maybeSingle();
  if (existing) return { ok: true, tracked: true };

  const tier = await resolveUserTier(supabase, user.id);
  const { count } = await supabase
    .from("inspiration_accounts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if (!withinLimit(tier, "accounts", count ?? 0)) {
    return {
      error: dict.planLimit(limitFor(tier, "accounts"), fullDict.billing.plans[tier].name),
    };
  }

  // Seed display fields from the global snapshot cache (admin — RLS-locked).
  const admin = createAdminClient();
  const { data: snap } = await admin
    .from("ig_account_snapshots")
    .select("display_name, followers_count, avatar_url")
    .eq("ig_username", ig)
    .maybeSingle();

  // Optionally file under a group named for the niche (find-or-create, owner-scoped).
  let groupId: string | null = null;
  if (niche && niche !== ALL_NICHES) {
    const name = slugifyNiche(niche).slice(0, 60);
    if (name) {
      const { data: g } = await supabase
        .from("account_groups")
        .select("id")
        .eq("user_id", user.id)
        .eq("name", name)
        .maybeSingle();
      if (g) {
        groupId = g.id as string;
      } else {
        const { data: created } = await supabase
          .from("account_groups")
          .insert({ user_id: user.id, name })
          .select("id")
          .maybeSingle();
        groupId = (created?.id as string) ?? null;
      }
    }
  }

  const { error } = await supabase.from("inspiration_accounts").insert({
    user_id: user.id,
    ig_username: ig,
    display_name: (snap?.display_name as string) ?? ig,
    followers_count: (snap?.followers_count as number) ?? null,
    avatar_url: (snap?.avatar_url as string) ?? null,
    is_active: true,
    group_id: groupId,
  });
  if (error) return { error: error.message };

  await track(user.id, "account_added", { bulk: false, source: "niche_radar" });
  revalidatePath("/dashboard/trends");
  revalidatePath("/dashboard/accounts");
  revalidatePath("/dashboard/feed");
  return { ok: true, tracked: true };
}
