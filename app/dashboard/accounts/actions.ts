"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getIgCredentials } from "@/lib/instagram/token-store";
import { fetchBusinessDiscovery, isValidIgUsername } from "@/lib/instagram/graph-api";
import { createMetaRateLimiter } from "@/lib/instagram/rate-limit";
import { track } from "@/lib/analytics/track";
import { resolveUserTier } from "@/lib/ai/tier";
import { limitFor, withinLimit, isUnlimited } from "@/lib/billing/entitlements";
import type { AiTier } from "@/lib/ai/tier";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { getDictionary } from "@/lib/i18n/dictionaries";

type ActionState = { error?: string };

async function dict() {
  const { locale } = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  return getDictionary(locale);
}

// Copy for a hit tracked-account cap (L6). Names the plan + limit so the user
// knows what upgrading buys them.
async function accountLimitError(tier: AiTier): Promise<string> {
  const d = await dict();
  return d.accounts.actions.accountLimit(d.billing.plans[tier].name, limitFor(tier, "accounts"));
}

// Count a user's tracked accounts (head-only, no rows pulled).
async function countTrackedAccounts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<number> {
  const { count } = await supabase
    .from("inspiration_accounts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  return count ?? 0;
}

export async function addInspirationAccount(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient();
  const d = await dict();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: d.accounts.actions.unauthorized };
  }

  const usernameValue = formData.get("ig_username");

  if (typeof usernameValue !== "string") {
    return { error: d.accounts.actions.usernameRequired };
  }

  const igUsername = usernameValue.trim().replace(/^@+/, "").toLowerCase();

  if (!igUsername) {
    return { error: d.accounts.actions.usernameRequired };
  }

  if (!isValidIgUsername(igUsername)) {
    return { error: d.accounts.actions.invalidUsername };
  }

  // Plan limit (L6): enforce the tracked-account cap before spending any Meta
  // budget on Business Discovery. Only a genuinely new account counts — re-adding
  // one already tracked just refreshes it via the upsert below.
  const { data: alreadyTracked } = await supabase
    .from("inspiration_accounts")
    .select("id")
    .eq("user_id", user.id)
    .eq("ig_username", igUsername)
    .maybeSingle();
  if (!alreadyTracked) {
    const tier = await resolveUserTier(supabase, user.id);
    const used = await countTrackedAccounts(supabase, user.id);
    if (!withinLimit(tier, "accounts", used)) {
      return { error: await accountLimitError(tier) };
    }
  }

  // Optional group, picked right in the add form. Only allow groups the user owns.
  const groupValue = formData.get("group_id");
  const groupId = typeof groupValue === "string" && groupValue ? groupValue : null;
  if (groupId) {
    const { data: group } = await supabase
      .from("account_groups")
      .select("id")
      .eq("id", groupId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!group) {
      return { error: d.accounts.actions.groupNotFound };
    }
  }

  // Require IG connection to validate account via Business Discovery. The token
  // is only reachable via the admin client (browser roles can't read it).
  const admin = createAdminClient();
  const credentials = await getIgCredentials(admin, user.id).catch(() => null);

  if (!credentials) {
    return {
      error: d.accounts.actions.connectInstagramFirst,
    };
  }

  // Validate account exists on Instagram via Business Discovery. Routed through
  // the shared app-level guard so account-adds also respect Meta's rate limit.
  const limiter = createMetaRateLimiter(admin, user.id);
  const { profile: igProfile, error: discoveryError } = await fetchBusinessDiscovery(
    credentials.igUserId,
    credentials.token,
    igUsername,
    limiter
  );

  if (discoveryError || !igProfile) {
    return {
      error: discoveryError ?? d.accounts.actions.accountNotFound,
    };
  }

  const { error: insertError } = await supabase.from("inspiration_accounts").upsert(
    {
      user_id: user.id,
      ig_username: igUsername,
      display_name: igProfile.username,
      followers_count: igProfile.followers_count ?? null,
      avatar_url: igProfile.profile_picture_url ?? null,
      is_active: true,
      group_id: groupId,
    },
    { onConflict: "user_id,ig_username" }
  );

  if (insertError) {
    return { error: insertError.message };
  }

  // Instrumentation (L5): funnel step — tracking inspiration accounts.
  await track(user.id, "account_added", { bulk: false, count: 1 });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/accounts");
  return {};
}

export type BulkAddState = {
  error?: string;
  added?: number;
  existing?: number;
  invalid?: string[];
  /** Accounts skipped because they'd exceed the plan's tracked-account cap (L6). */
  limited?: number;
};

// Bulk add (used by the "Import accounts you follow" flow). Skips per-account
// Business Discovery validation — that would burn the shared Instagram budget
// on a big import — so invalid/non-Business accounts simply fail on their
// first sync, and profile data (avatar, followers) backfills then too.
export async function bulkAddInspirationAccounts(
  _prevState: BulkAddState,
  formData: FormData
): Promise<BulkAddState> {
  const supabase = await createClient();
  const d = await dict();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: d.accounts.actions.unauthorized };
  }

  const raw = formData.get("usernames");
  if (typeof raw !== "string" || !raw.trim()) {
    return { error: d.accounts.actions.noUsernamesProvided };
  }

  const candidates = Array.from(
    new Set(
      raw
        .split(/[\s,;]+/)
        .map((u) => u.trim().replace(/^@+/, "").toLowerCase())
        .filter(Boolean)
    )
  );

  if (candidates.length === 0) {
    return { error: d.accounts.actions.noUsernamesProvided };
  }
  if (candidates.length > 300) {
    return { error: d.accounts.actions.tooManyUsernames };
  }

  const invalid = candidates.filter((u) => !isValidIgUsername(u));
  const usernames = candidates.filter((u) => isValidIgUsername(u));

  if (usernames.length === 0) {
    return { error: d.accounts.actions.noneValidUsernames, invalid };
  }

  const groupValue = formData.get("group_id");
  const groupId = typeof groupValue === "string" && groupValue ? groupValue : null;
  if (groupId) {
    const { data: group } = await supabase
      .from("account_groups")
      .select("id")
      .eq("id", groupId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!group) {
      return { error: d.accounts.actions.groupNotFound };
    }
  }

  const { data: existingRows } = await supabase
    .from("inspiration_accounts")
    .select("ig_username")
    .eq("user_id", user.id)
    .in("ig_username", usernames);

  const existingSet = new Set((existingRows ?? []).map((r) => r.ig_username));
  let fresh = usernames.filter((u) => !existingSet.has(u));

  // Plan limit (L6): trim the import to whatever tracked-account slots remain on
  // the user's tier, importing as many as fit and reporting the rest as skipped.
  let limited = 0;
  if (fresh.length > 0) {
    const tier = await resolveUserTier(supabase, user.id);
    const cap = limitFor(tier, "accounts");
    if (!isUnlimited(cap)) {
      const used = await countTrackedAccounts(supabase, user.id);
      const remaining = Math.max(0, cap - used);
      if (fresh.length > remaining) {
        limited = fresh.length - remaining;
        fresh = fresh.slice(0, remaining);
      }
      if (remaining === 0) {
        return { error: await accountLimitError(tier), existing: existingSet.size, limited };
      }
    }
  }

  if (fresh.length > 0) {
    const { error: insertError } = await supabase.from("inspiration_accounts").insert(
      fresh.map((u) => ({
        user_id: user.id,
        ig_username: u,
        display_name: u,
        is_active: true,
        group_id: groupId,
      }))
    );

    if (insertError) {
      return { error: insertError.message };
    }

    // Instrumentation (L5): funnel step — tracking inspiration accounts.
    await track(user.id, "account_added", { bulk: true, count: fresh.length });
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/accounts");
  revalidatePath("/dashboard/feed");

  return {
    added: fresh.length,
    existing: existingSet.size,
    invalid: invalid.length > 0 ? invalid : undefined,
    limited: limited > 0 ? limited : undefined,
  };
}

export async function createAccountGroup(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient();
  const d = await dict();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: d.accounts.actions.unauthorized };
  }

  const nameValue = formData.get("name");
  if (typeof nameValue !== "string") {
    return { error: d.accounts.actions.groupNameRequired };
  }

  const name = nameValue.trim();
  if (!name) {
    return { error: d.accounts.actions.groupNameRequired };
  }
  if (name.length > 40) {
    return { error: d.accounts.actions.groupNameTooLong };
  }

  const { error } = await supabase.from("account_groups").insert({ user_id: user.id, name });

  if (error) {
    if (error.code === "23505") {
      return { error: d.accounts.actions.groupNameExists };
    }
    return { error: error.message };
  }

  revalidatePath("/dashboard/accounts");
  revalidatePath("/dashboard/feed");
  return {};
}

export async function deleteAccountGroup(formData: FormData) {
  const supabase = await createClient();
  const d = await dict();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error(d.accounts.actions.unauthorized);
  }

  const groupId = formData.get("group_id");
  if (typeof groupId !== "string" || !groupId) {
    throw new Error(d.accounts.actions.groupIdRequired);
  }

  const { error } = await supabase
    .from("account_groups")
    .delete()
    .eq("id", groupId)
    .eq("user_id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard/accounts");
  revalidatePath("/dashboard/feed");
}

export async function renameAccountGroup(formData: FormData) {
  const supabase = await createClient();
  const d = await dict();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error(d.accounts.actions.unauthorized);
  }

  const groupId = formData.get("group_id");
  const nameValue = formData.get("name");

  if (typeof groupId !== "string" || !groupId) {
    throw new Error(d.accounts.actions.groupIdRequired);
  }

  const name = typeof nameValue === "string" ? nameValue.trim() : "";
  if (!name) {
    throw new Error(d.accounts.actions.groupNameRequired);
  }
  if (name.length > 40) {
    throw new Error(d.accounts.actions.groupNameTooLong);
  }

  const { error } = await supabase
    .from("account_groups")
    .update({ name })
    .eq("id", groupId)
    .eq("user_id", user.id);

  if (error) {
    if (error.code === "23505") {
      throw new Error(d.accounts.actions.groupNameExists);
    }
    throw new Error(error.message);
  }

  revalidatePath("/dashboard/accounts");
  revalidatePath("/dashboard/feed");
}

export async function assignAccountGroup(formData: FormData) {
  const supabase = await createClient();
  const d = await dict();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error(d.accounts.actions.unauthorized);
  }

  const accountId = formData.get("account_id");
  const groupValue = formData.get("group_id");

  if (typeof accountId !== "string" || !accountId) {
    throw new Error(d.accounts.actions.accountIdRequired);
  }

  const groupId = typeof groupValue === "string" && groupValue ? groupValue : null;

  // Only allow assigning to a group the user owns.
  if (groupId) {
    const { data: group } = await supabase
      .from("account_groups")
      .select("id")
      .eq("id", groupId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!group) {
      throw new Error(d.accounts.actions.groupNotFound);
    }
  }

  const { error } = await supabase
    .from("inspiration_accounts")
    .update({ group_id: groupId })
    .eq("id", accountId)
    .eq("user_id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard/accounts");
  revalidatePath("/dashboard/feed");
}

export async function toggleAccountActive(formData: FormData) {
  const supabase = await createClient();
  const d = await dict();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error(d.accounts.actions.unauthorized);
  }

  const accountId = formData.get("account_id");
  const desired = formData.get("is_active");

  if (typeof accountId !== "string" || !accountId) {
    throw new Error(d.accounts.actions.accountIdRequired);
  }

  const isActive = desired === "true";

  const { error } = await supabase
    .from("inspiration_accounts")
    .update({ is_active: isActive })
    .eq("id", accountId)
    .eq("user_id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard/accounts");
  revalidatePath("/dashboard/feed");
}

export async function removeInspirationAccount(formData: FormData) {
  const supabase = await createClient();
  const d = await dict();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error(d.accounts.actions.unauthorized);
  }

  const accountId = formData.get("account_id");

  if (typeof accountId !== "string" || !accountId) {
    throw new Error(d.accounts.actions.accountIdRequired);
  }

  const { error } = await supabase
    .from("inspiration_accounts")
    .delete()
    .eq("id", accountId)
    .eq("user_id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/accounts");
}
