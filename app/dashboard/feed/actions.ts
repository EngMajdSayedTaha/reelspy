"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function markReelAsWorkedOn(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const reelId = formData.get("reel_id");

  if (typeof reelId !== "string" || !reelId) {
    throw new Error("Reel id is required.");
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const reelId = formData.get("reel_id");
  if (typeof reelId !== "string" || !reelId) {
    throw new Error("Reel id is required.");
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
