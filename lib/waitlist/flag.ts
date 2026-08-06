import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// The waiting-list switch.
//
// State lives in ONE app_settings row, `flag:waitlist`, so the founder flips
// the whole feature from /admin/waitlist with no redeploy and no env var. An
// absent row means OFF — which is why the migration seeds nothing: applying it
// changes no behaviour at all.
//
// Fails CLOSED-AS-OFF: any error reading the setting resolves to "waitlist
// disabled". That is deliberate and is the only safe direction. The failure
// mode of guessing ON is that a DB blip locks every paying customer out of the
// product; the failure mode of guessing OFF is that a few people slip past a
// marketing gate during an outage. Same fail-open posture the rest of the app
// takes on missing infrastructure.

export const WAITLIST_FLAG_KEY = "flag:waitlist";

export type WaitlistFlag = {
  /** Master switch. Everything else is inert when false. */
  enabled: boolean;
  /**
   * When the switch was last turned OFF→ON, ISO. Accounts created before this
   * instant are grandfathered straight past the gate — flipping the switch must
   * never lock out an existing (let alone paying) customer. Re-stamped on every
   * off→on transition, so people who joined during an open window keep access.
   */
  enabledSince: string | null;
  /**
   * Approve every new entry the moment it arrives. Turns the waitlist into pure
   * lead capture + a queue number, with no gate — useful for a "soft launch"
   * where you want the list and the emails but not the friction.
   */
  autoApprove: boolean;
  /**
   * Send the "you're on the list" / "you're in" emails. Off by default because
   * Resend may not be provisioned yet; sends are best-effort regardless.
   */
  sendEmails: boolean;
};

export const WAITLIST_FLAG_DEFAULT: WaitlistFlag = {
  enabled: false,
  enabledSince: null,
  autoApprove: false,
  sendEmails: true,
};

// Tolerant of anything already sitting in the row (it's a free-form jsonb an
// admin can hand-edit through the generic settings panel).
export function normalizeWaitlistFlag(value: unknown): WaitlistFlag {
  const v = (value ?? {}) as Record<string, unknown>;
  const since = typeof v.enabledSince === "string" && v.enabledSince ? v.enabledSince : null;
  return {
    enabled: v.enabled === true,
    enabledSince: since && !Number.isNaN(Date.parse(since)) ? since : null,
    autoApprove: v.autoApprove === true,
    sendEmails: v.sendEmails !== false,
  };
}

/**
 * Read the flag. `admin` must be the service-role client — app_settings has RLS
 * on with no policies, so the anon/authenticated clients see nothing.
 *
 * No caching on purpose: this is a primary-key lookup on a table with a handful
 * of rows, and it runs only on authenticated dashboard loads. A cache would buy
 * microseconds and cost correctness — an admin flipping the switch would watch
 * nothing happen for the TTL, on a random subset of serverless instances.
 */
export async function readWaitlistFlag(admin: SupabaseClient): Promise<WaitlistFlag> {
  try {
    const { data, error } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", WAITLIST_FLAG_KEY)
      .maybeSingle();
    if (error || !data) return WAITLIST_FLAG_DEFAULT;
    return normalizeWaitlistFlag(data.value);
  } catch {
    return WAITLIST_FLAG_DEFAULT;
  }
}

/**
 * Build the next flag value for a toggle, preserving the grandfather stamp.
 * Exported (and pure) so the admin route stays a thin wrapper and the rule is
 * unit-testable: `enabledSince` is stamped on every OFF→ON transition and left
 * alone otherwise, so re-saving an already-on flag never moves the cutoff and
 * never strands users who got in after it.
 */
export function nextWaitlistFlag(
  current: WaitlistFlag,
  patch: Partial<Omit<WaitlistFlag, "enabledSince">>,
  now: string
): WaitlistFlag {
  const next: WaitlistFlag = { ...current, ...patch };
  if (next.enabled && !current.enabled) next.enabledSince = now;
  return next;
}
