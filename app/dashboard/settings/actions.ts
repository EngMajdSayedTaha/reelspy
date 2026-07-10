"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_PREFS,
  FEED_PER_PAGE_OPTIONS,
  PREFS_COOKIE,
  SYNC_LIMIT_OPTIONS,
  TOAST_MS_OPTIONS,
  parsePrefs,
  serializePrefs,
  type UserPrefs,
} from "@/lib/prefs";
import { normalizeLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { THEME_COOKIE, normalizeColorTheme } from "@/lib/color-theme";

function pick<T extends number>(value: FormDataEntryValue | null, allowed: readonly T[], fallback: T): T {
  const n = Number(value);
  return (allowed as readonly number[]).includes(n) ? (n as T) : fallback;
}

export async function savePreferences(formData: FormData): Promise<void> {
  const prefs: UserPrefs = {
    toastMs: pick(formData.get("toastMs"), TOAST_MS_OPTIONS, DEFAULT_PREFS.toastMs),
    syncLimit: pick(formData.get("syncLimit"), SYNC_LIMIT_OPTIONS, DEFAULT_PREFS.syncLimit),
    feedPerPage: pick(formData.get("feedPerPage"), FEED_PER_PAGE_OPTIONS, DEFAULT_PREFS.feedPerPage),
    locale: normalizeLocale(formData.get("locale")),
  };

  const cookieStore = await cookies();
  cookieStore.set(PREFS_COOKIE, serializePrefs(prefs), {
    // Readable by client widgets (toast duration, sync defaults) — UI tuning
    // only, nothing sensitive, so httpOnly stays off.
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/dashboard", "layout");
}

// Weekly digest opt-in/out (V3/W6). Writes the DB flag via the user's own
// client (RLS + the digest_opt_out update grant scope it to the owner).
export async function setDigestOptOut(optOut: boolean): Promise<void> {
  const { locale } = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  const dict = getDictionary(locale).settings;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error(dict.unauthorized);

  const { error } = await supabase
    .from("profiles")
    .update({ digest_opt_out: optOut })
    .eq("id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/settings");
}

// Preset color theme. DB is the cross-device source of truth; the cookie
// mirror lets the root layout stamp <html data-theme> at SSR with no flash.
export async function setColorTheme(theme: string): Promise<void> {
  const cookieStore = await cookies();
  const { locale } = parsePrefs(cookieStore.get(PREFS_COOKIE)?.value);
  const dict = getDictionary(locale).settings;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error(dict.unauthorized);

  const colorTheme = normalizeColorTheme(theme);
  const { error } = await supabase
    .from("profiles")
    .update({ color_theme: colorTheme })
    .eq("id", user.id);
  if (error) throw new Error(error.message);

  cookieStore.set(THEME_COOKIE, colorTheme, {
    // Client-readable on purpose: applyColorTheme keeps it in sync client-side.
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/dashboard/settings");
}
