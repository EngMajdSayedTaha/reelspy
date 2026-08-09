import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PLATFORMS, type Platform } from "./types";

// The publish-platforms switch — one app_settings row, `flag:platforms`, so
// the founder can turn off publishing to a given platform (e.g. TikTok during
// an API incident) for every user, without a redeploy. Same shape as
// lib/waitlist/flag.ts and lib/dashboard/pages-flag.ts.
//
// This only gates NEW publish targets (composer selection + job creation),
// the same "creation-time policy" layer `publicAllowed` already uses in
// app/dashboard/publishing/page.tsx — it does not touch jobs already queued.
//
// Fails OPEN to "enabled": an absent row, a read error, or an unrecognized
// platform all resolve to available. Guessing "disabled" during a DB blip
// would silently break publishing for every paying customer.

export const PLATFORMS_FLAG_KEY = "flag:platforms";

export type PlatformsFlag = Record<Platform, boolean>;

export const PLATFORMS_FLAG_DEFAULT: PlatformsFlag = Object.fromEntries(
  PLATFORMS.map((platform) => [platform, true])
) as PlatformsFlag;

// Tolerant of anything already sitting in the row. Only an explicit `false`
// disables a platform — anything else (missing, true, a stray string) leaves
// it enabled.
export function normalizePlatformsFlag(value: unknown): PlatformsFlag {
  const v = (value ?? {}) as Record<string, unknown>;
  const out = { ...PLATFORMS_FLAG_DEFAULT };
  for (const platform of PLATFORMS) {
    if (v[platform] === false) out[platform] = false;
  }
  return out;
}

/**
 * Read the flag. `admin` must be the service-role client — app_settings has RLS
 * on with no policies, so the anon/authenticated clients see nothing.
 */
export async function readPlatformsFlag(admin: SupabaseClient): Promise<PlatformsFlag> {
  try {
    const { data, error } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", PLATFORMS_FLAG_KEY)
      .maybeSingle();
    if (error || !data) return PLATFORMS_FLAG_DEFAULT;
    return normalizePlatformsFlag(data.value);
  } catch {
    return PLATFORMS_FLAG_DEFAULT;
  }
}
