"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { getDictionary } from "@/lib/i18n/dictionaries";

async function feedActionsDict() {
  const { locale } = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  return getDictionary(locale).feed.actions;
}

export async function markReelAsWorkedOn(formData: FormData) {
  const dict = await feedActionsDict();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error(dict.unauthorized);
  }

  const reelId = formData.get("reel_id");

  if (typeof reelId !== "string" || !reelId) {
    throw new Error(dict.reelIdRequired);
  }

  const { error } = await supabase
    .from("tracked_reels")
    .update({
      is_worked_on: true,
      worked_on_at: new Date().toISOString(),
    })
    .eq("id", reelId)
    .eq("user_id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/feed");
}

export async function setReelDiscarded(formData: FormData) {
  const dict = await feedActionsDict();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error(dict.unauthorized);
  }

  const reelId = formData.get("reel_id");
  if (typeof reelId !== "string" || !reelId) {
    throw new Error(dict.reelIdRequired);
  }

  const discarded = formData.get("discarded") === "true";

  const { error } = await supabase
    .from("tracked_reels")
    .update({
      is_discarded: discarded,
      discarded_at: discarded ? new Date().toISOString() : null,
    })
    .eq("id", reelId)
    .eq("user_id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard/feed");
}

export async function setReelFavorited(formData: FormData) {
  const dict = await feedActionsDict();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error(dict.unauthorized);
  }

  const reelId = formData.get("reel_id");
  if (typeof reelId !== "string" || !reelId) {
    throw new Error(dict.reelIdRequired);
  }

  const favorite = formData.get("favorite") === "true";

  const { error } = await supabase
    .from("tracked_reels")
    .update({
      is_favorite: favorite,
      favorited_at: favorite ? new Date().toISOString() : null,
    })
    .eq("id", reelId)
    .eq("user_id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard/feed");
}
