// One-line helpers for the two reliability alerts that any background worker
// might need to raise, so a cron route doesn't have to compose an alert by hand
// (and so twelve routes can't invent twelve different titles for the same
// thing).
//
// Both inherit notifyAdmins' contract: they never throw, and they are safe to
// await inside a handler that is already failing.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyAdmins } from "@/lib/notifications/notify";

/**
 * A scheduled run broke. Deduped per cron name, so a job that fails every five
 * minutes produces one alert and a repeat count rather than 288 emails a day —
 * which is the difference between an alert channel a founder reads and one they
 * filter away.
 */
export async function notifyCronFailure(
  name: string,
  error: unknown,
  opts: { admin?: SupabaseClient; context?: Record<string, string | number | undefined> } = {}
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error ?? "unknown error");
  await notifyAdmins(
    "cron.failed",
    {
      title: `Scheduled task failed: ${name}`,
      summary: message.slice(0, 300),
      context: { Task: name, ...(opts.context ?? {}) },
      link: "/admin/ops",
      dedupeKey: `cron:${name}`,
    },
    opts.admin ? { admin: opts.admin } : undefined
  );
}

/**
 * A third-party dependency stopped working — expired Instagram cookies, a
 * revoked Meta token, a provider outage. Deduped per integration, and throttled
 * hard by the catalog (12h): these fail continuously until someone fixes them,
 * so the useful signal is "still broken", not "broken 400 times".
 */
export async function notifyIntegrationUnhealthy(
  integration: string,
  params: {
    summary: string;
    context?: Record<string, string | number | undefined>;
    link?: string;
    admin?: SupabaseClient;
  }
): Promise<void> {
  await notifyAdmins(
    "integration.unhealthy",
    {
      title: `${integration} is unhealthy`,
      summary: params.summary,
      context: { Integration: integration, ...(params.context ?? {}) },
      link: params.link ?? "/admin/ops",
      dedupeKey: `integration:${integration}`,
    },
    params.admin ? { admin: params.admin } : undefined
  );
}
