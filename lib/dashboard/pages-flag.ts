import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DASHBOARD_PAGES, type PagesFlag } from "./pages";

export type { PagesFlag };

// The dashboard-pages switch — one app_settings row, `flag:pages`, so the
// founder can hide any dashboard section from every user's sidebar (and block
// direct navigation to it) without a redeploy. Same shape as lib/waitlist/flag.ts.
//
// Fails OPEN to "visible": an absent row, a read error, or an unrecognized
// page id all resolve to shown. Guessing "hidden" during a DB blip would take
// working product surface away from every paying customer; guessing "shown"
// only risks a page staying visible a little longer than an admin wanted.

export const PAGES_FLAG_KEY = "flag:pages";

export const PAGES_FLAG_DEFAULT: PagesFlag = Object.fromEntries(
  DASHBOARD_PAGES.map((page) => [page.id, true])
) as PagesFlag;

// Tolerant of anything already sitting in the row (free-form jsonb an admin
// can hand-edit through the generic settings panel too). Only an explicit
// `false` hides a page — anything else (missing, true, a stray string) shows it.
export function normalizePagesFlag(value: unknown): PagesFlag {
  const v = (value ?? {}) as Record<string, unknown>;
  const out = { ...PAGES_FLAG_DEFAULT };
  for (const page of DASHBOARD_PAGES) {
    if (v[page.id] === false) out[page.id] = false;
  }
  return out;
}

/**
 * Read the flag. `admin` must be the service-role client — app_settings has RLS
 * on with no policies, so the anon/authenticated clients see nothing.
 */
export async function readPagesFlag(admin: SupabaseClient): Promise<PagesFlag> {
  try {
    const { data, error } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", PAGES_FLAG_KEY)
      .maybeSingle();
    if (error || !data) return PAGES_FLAG_DEFAULT;
    return normalizePagesFlag(data.value);
  } catch {
    return PAGES_FLAG_DEFAULT;
  }
}
