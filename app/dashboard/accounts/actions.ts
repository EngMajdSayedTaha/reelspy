"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getIgCredentials } from "@/lib/instagram/token-store";
import { fetchBusinessDiscovery, isValidIgUsername } from "@/lib/instagram/graph-api";
import { createMetaRateLimiter } from "@/lib/instagram/rate-limit";
import { track } from "@/lib/analytics/track";

type ActionState = { error?: string };

export async function addInspirationAccount(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Unauthorized." };
  }

  const usernameValue = formData.get("ig_username");

  if (typeof usernameValue !== "string") {
    return { error: "Instagram username is required." };
  }

  const igUsername = usernameValue.trim().replace(/^@+/, "").toLowerCase();

  if (!igUsername) {
    return { error: "Instagram username is required." };
  }

  if (!isValidIgUsername(igUsername)) {
    return { error: "Usernames can only contain letters, numbers, dots and underscores (max 30)." };
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
      return { error: "Group not found." };
    }
  }

  // Require IG connection to validate account via Business Discovery. The token
  // is only reachable via the admin client (browser roles can't read it).
  const admin = createAdminClient();
  const credentials = await getIgCredentials(admin, user.id).catch(() => null);

  if (!credentials) {
    return {
      error: "Connect your Instagram account first (Settings → Instagram) before adding inspiration accounts.",
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
      error: discoveryError ?? "Account not found or not a Business/Creator account.",
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Unauthorized." };
  }

  const raw = formData.get("usernames");
  if (typeof raw !== "string" || !raw.trim()) {
    return { error: "No usernames provided." };
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
    return { error: "No usernames provided." };
  }
  if (candidates.length > 300) {
    return { error: "That's a lot at once — import up to 300 accounts at a time." };
  }

  const invalid = candidates.filter((u) => !isValidIgUsername(u));
  const usernames = candidates.filter((u) => isValidIgUsername(u));

  if (usernames.length === 0) {
    return { error: "None of those look like valid Instagram usernames.", invalid };
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
      return { error: "Group not found." };
    }
  }

  const { data: existingRows } = await supabase
    .from("inspiration_accounts")
    .select("ig_username")
    .eq("user_id", user.id)
    .in("ig_username", usernames);

  const existingSet = new Set((existingRows ?? []).map((r) => r.ig_username));
  const fresh = usernames.filter((u) => !existingSet.has(u));

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
  };
}

export async function createAccountGroup(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Unauthorized." };
  }

  const nameValue = formData.get("name");
  if (typeof nameValue !== "string") {
    return { error: "Group name is required." };
  }

  const name = nameValue.trim();
  if (!name) {
    return { error: "Group name is required." };
  }
  if (name.length > 40) {
    return { error: "Group name must be 40 characters or fewer." };
  }

  const { error } = await supabase.from("account_groups").insert({ user_id: user.id, name });

  if (error) {
    if (error.code === "23505") {
      return { error: "A group with that name already exists." };
    }
    return { error: error.message };
  }

  revalidatePath("/dashboard/accounts");
  revalidatePath("/dashboard/feed");
  return {};
}

export async function deleteAccountGroup(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const groupId = formData.get("group_id");
  if (typeof groupId !== "string" || !groupId) {
    throw new Error("Group id is required.");
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const groupId = formData.get("group_id");
  const nameValue = formData.get("name");

  if (typeof groupId !== "string" || !groupId) {
    throw new Error("Group id is required.");
  }

  const name = typeof nameValue === "string" ? nameValue.trim() : "";
  if (!name) {
    throw new Error("Group name is required.");
  }
  if (name.length > 40) {
    throw new Error("Group name must be 40 characters or fewer.");
  }

  const { error } = await supabase
    .from("account_groups")
    .update({ name })
    .eq("id", groupId)
    .eq("user_id", user.id);

  if (error) {
    if (error.code === "23505") {
      throw new Error("A group with that name already exists.");
    }
    throw new Error(error.message);
  }

  revalidatePath("/dashboard/accounts");
  revalidatePath("/dashboard/feed");
}

export async function assignAccountGroup(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const accountId = formData.get("account_id");
  const groupValue = formData.get("group_id");

  if (typeof accountId !== "string" || !accountId) {
    throw new Error("Account id is required.");
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
      throw new Error("Group not found.");
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const accountId = formData.get("account_id");
  const desired = formData.get("is_active");

  if (typeof accountId !== "string" || !accountId) {
    throw new Error("Account id is required.");
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const accountId = formData.get("account_id");

  if (typeof accountId !== "string" || !accountId) {
    throw new Error("Account id is required.");
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
