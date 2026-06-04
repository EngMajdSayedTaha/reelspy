"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type ScriptStatus = "draft" | "ready" | "published";

export async function updateScriptStatus(scriptId: string, status: ScriptStatus) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("generated_scripts")
    .update({ status })
    .eq("id", scriptId)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/scripts");
}

export async function deleteScript(formData: FormData) {
  const scriptId = formData.get("script_id");
  if (typeof scriptId !== "string" || !scriptId) throw new Error("script_id required");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("generated_scripts")
    .delete()
    .eq("id", scriptId)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/scripts");
}

export async function scheduleScript(scriptId: string, date: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("generated_scripts")
    .update({ scheduled_date: date })
    .eq("id", scriptId)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/scripts");
  revalidatePath("/dashboard/calendar");
}
