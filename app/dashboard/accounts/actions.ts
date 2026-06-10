"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getIgCredentials } from "@/lib/instagram/token-store";
import { fetchBusinessDiscovery, isValidIgUsername } from "@/lib/instagram/graph-api";
import { createMetaRateLimiter } from "@/lib/instagram/rate-limit";

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
    },
    { onConflict: "user_id,ig_username" }
  );

  if (insertError) {
    return { error: insertError.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/accounts");
  return {};
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
