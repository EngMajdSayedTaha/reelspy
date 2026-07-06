"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { PREFS_COOKIE, parsePrefs, serializePrefs } from "@/lib/prefs";
import { normalizeLocale } from "@/lib/i18n/config";

// Locale-only toggle for the navbar switcher — merges into the existing prefs
// cookie so it doesn't clobber toastMs/syncLimit/feedPerPage (unlike the full
// settings-page save, which resubmits every field).
export async function setLocale(rawLocale: string): Promise<void> {
  const cookieStore = await cookies();
  const current = parsePrefs(cookieStore.get(PREFS_COOKIE)?.value);
  const next = { ...current, locale: normalizeLocale(rawLocale) };

  cookieStore.set(PREFS_COOKIE, serializePrefs(next), {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/dashboard", "layout");
}
