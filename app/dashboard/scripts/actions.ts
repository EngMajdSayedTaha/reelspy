"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { getDictionary } from "@/lib/i18n/dictionaries";

async function scriptsActionsDict() {
  const { locale } = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  return getDictionary(locale).scripts.actions;
}

type ScriptStatus = "draft" | "ready" | "published";

export async function updateScriptStatus(scriptId: string, status: ScriptStatus) {
  const dict = await scriptsActionsDict();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error(dict.unauthorized);

  const { error } = await supabase
    .from("generated_scripts")
    .update({ status })
    .eq("id", scriptId)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/scripts");
}

export async function deleteScript(formData: FormData) {
  const dict = await scriptsActionsDict();
  const scriptId = formData.get("script_id");
  if (typeof scriptId !== "string" || !scriptId) throw new Error(dict.scriptIdRequired);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error(dict.unauthorized);

  const { error } = await supabase
    .from("generated_scripts")
    .delete()
    .eq("id", scriptId)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/scripts");
}

export async function scheduleScript(scriptId: string, date: string) {
  const dict = await scriptsActionsDict();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(dict.invalidDate);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error(dict.unauthorized);

  const { error } = await supabase
    .from("generated_scripts")
    .update({ scheduled_date: date })
    .eq("id", scriptId)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/scripts");
  revalidatePath("/dashboard/calendar");
}

export async function unscheduleScript(scriptId: string) {
  const dict = await scriptsActionsDict();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error(dict.unauthorized);

  const { error } = await supabase
    .from("generated_scripts")
    .update({ scheduled_date: null })
    .eq("id", scriptId)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/scripts");
  revalidatePath("/dashboard/calendar");
}
