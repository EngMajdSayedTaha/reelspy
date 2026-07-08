// Monthly entitlement enforcement (L6 / B1) for the metered actions — scripts
// and transcripts. Resolves the caller's tier limit from entitlements.ts and
// runs it through the consume_user_action_monthly RPC (calendar-month window,
// see 20260703d_billing.sql). This is the monthly companion to the hourly
// consume_user_action throttle in lib/utils/user-rate-limit.ts: the hourly one
// stops loops, this one enforces the plan you pay for.
//
// Fail-open: if the RPC isn't provisioned (migration not applied) or errors, the
// call is allowed — a feature must never hard-break on billing infra. The env
// default tier (usually free) still bounds abuse via the hourly limiter.

import type { SupabaseClient } from "@supabase/supabase-js";
import { isUnlimited, limitOf, type Entitlements } from "@/lib/billing/entitlements";

// Entitlement keys that map to a monthly, RPC-metered quota.
export type MonthlyQuotaKey = "scripts_mo" | "transcripts_mo";

// The RPC action name is stable and independent of the entitlement key so the
// usage table stays readable ("script" / "transcript").
const RPC_ACTION: Record<MonthlyQuotaKey, string> = {
  scripts_mo: "script",
  transcripts_mo: "transcript",
};

export type MonthlyQuotaResult = {
  allowed: boolean;
  used: number;
  remaining: number; // -1 when unlimited
  limit: number; // -1 when unlimited
  resetAt: string | null;
};

export async function consumeMonthlyQuota(
  supabase: SupabaseClient,
  userId: string,
  entitlements: Entitlements,
  key: MonthlyQuotaKey
): Promise<MonthlyQuotaResult> {
  const limit = limitOf(entitlements, key);

  // Unlimited tiers skip the DB round-trip entirely (studio scripts/transcripts).
  if (isUnlimited(limit)) {
    return { allowed: true, used: 0, remaining: -1, limit, resetAt: null };
  }

  try {
    const { data, error } = await supabase.rpc("consume_user_action_monthly", {
      p_user_id: userId,
      p_action: RPC_ACTION[key],
      p_limit: limit,
    });

    if (error) {
      console.warn(`[quota] consume_user_action_monthly(${key}) failed; allowing:`, error.message);
      return { allowed: true, used: 0, remaining: limit, limit, resetAt: null };
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      return { allowed: true, used: 0, remaining: limit, limit, resetAt: null };
    }
    return {
      allowed: row.allowed !== false,
      used: row.used ?? 0,
      remaining: row.remaining ?? 0,
      limit,
      resetAt: row.period_end ?? null,
    };
  } catch (err) {
    console.warn(`[quota] ${key} threw; allowing:`, err instanceof Error ? err.message : err);
    return { allowed: true, used: 0, remaining: limit, limit, resetAt: null };
  }
}

// Friendly copy for a hit monthly cap, e.g. on the generate/transcript routes.
export function monthlyLimitMessage(key: MonthlyQuotaKey, limit: number, resetAt: string | null): string {
  const noun = key === "scripts_mo" ? "scripts" : "transcripts";
  const when = resetAt ? ` It resets on ${new Date(resetAt).toLocaleDateString()}.` : "";
  return `You've used all ${limit} ${noun} on your plan this month.${when} Upgrade for more.`;
}
