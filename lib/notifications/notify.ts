// notifyAdmins() — the one call every part of the product makes when something
// the founder should know about happens.
//
//   await notifyAdmins("billing.dispute_opened", {
//     title: "Chargeback opened on a $29 charge",
//     summary: "Stripe needs evidence within 7 days.",
//     context: { Customer: email, Amount: "$29.00" },
//     link: "/admin/billing",
//     dedupeKey: `dispute:${dispute.id}`,
//   });
//
// Everything else — is this event on, does it clear the severity floor, is it
// quiet hours, has an identical alert just fired, who receives it, does the
// mailer even exist — is decided here, so a caller never has to know and can
// never get it subtly wrong.
//
// THE CONTRACT: this function never throws and never rejects. It is called from
// a Stripe webhook, from a job worker, from the public waiting-list endpoint —
// paths where an alerting failure must not become a user-visible failure or a
// webhook retry storm. Every error inside is logged and swallowed. Callers may
// `await` it (it is two queries and a send) without risk.
//
// The alert is ALWAYS logged, even when it is dropped or suppressed. The admin
// inbox is the source of truth; email is a channel on top of it. That is what
// makes "I never got an email about this" a debuggable question.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailConfigured } from "@/lib/email/send";
import { alertEvent, type Severity } from "@/lib/notifications/catalog";
import {
  effectiveEventPrefs,
  readAdminNotificationPrefs,
  resolveRecipients,
} from "@/lib/notifications/prefs";
import { routeAlert } from "@/lib/notifications/routing";
import { sendAlertEmail } from "@/lib/notifications/email";

export type NotifyInput = {
  /** One line, subject-length. Written as a fact, not a category. */
  title: string;
  /** A sentence of context: what it means, or what to do about it. */
  summary?: string | null;
  /** Label → value pairs. Nullish and empty values are dropped. */
  context?: Record<string, string | number | boolean | null | undefined>;
  /** Relative admin path that acts on this, e.g. "/admin/users/<id>". */
  link?: string | null;
  /**
   * Identity of the THING this is about ("job:publish_post", "user:<id>"). Two
   * alerts with the same event AND dedupe key inside the throttle window fold
   * into one row with a count instead of two emails. Omit when every occurrence
   * is genuinely distinct (a new signup is never a repeat of another signup).
   */
  dedupeKey?: string | null;
  /** Override the catalog severity — for an event that is usually routine. */
  severity?: Severity;
};

export type NotifyResult = {
  /** False only when the event key is unknown or the DB was unreachable. */
  logged: boolean;
  delivery: "emailed" | "digested" | "pending" | "suppressed" | "dropped" | "failed" | "error";
  reason: string;
};

const MAX_TITLE = 200;
const MAX_SUMMARY = 1000;

function cleanContext(
  context: NotifyInput["context"]
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [label, value] of Object.entries(context ?? {})) {
    if (value === null || value === undefined || value === "") continue;
    out[label.slice(0, 60)] = String(value).slice(0, 300);
  }
  return out;
}

export async function notifyAdmins(
  event: string,
  input: NotifyInput,
  opts?: { admin?: SupabaseClient }
): Promise<NotifyResult> {
  try {
    const def = alertEvent(event);
    if (!def) {
      // A typo in an event key must be loud in the logs and silent everywhere
      // else — never a thrown error on a webhook path.
      console.warn(`[alerts] unknown event key "${event}" — nothing raised`);
      return { logged: false, delivery: "error", reason: "unknown_event" };
    }

    let admin: SupabaseClient;
    try {
      admin = opts?.admin ?? createAdminClient();
    } catch {
      console.warn(`[alerts] ${event}: no service-role client — alert not recorded`);
      return { logged: false, delivery: "error", reason: "no_admin_client" };
    }

    const severity = input.severity ?? def.severity;
    const prefs = await readAdminNotificationPrefs(admin);
    // The severity override rides on the definition so routing sees the same
    // severity the alert is stored with — otherwise a caller could raise a
    // `critical` alert that quiet hours still swallows.
    const routedDef = { ...def, severity };
    const decision = routeAlert(prefs, routedDef, new Date());

    const context = cleanContext(input.context);
    const title = input.title.trim().slice(0, MAX_TITLE) || def.label;
    const summary = input.summary?.trim().slice(0, MAX_SUMMARY) ?? null;
    const dedupeKey = input.dedupeKey?.slice(0, 200) ?? null;

    // ── Repeat folding ──────────────────────────────────────────────────────
    // Only for alerts that were actually going somewhere: a dropped alert has
    // no email to suppress, and folding them would hide occurrences from the
    // inbox for no benefit.
    const { throttleMinutes } = effectiveEventPrefs(prefs, routedDef);
    if (decision.action !== "drop" && throttleMinutes > 0) {
      const since = new Date(Date.now() - throttleMinutes * 60_000).toISOString();
      let q = admin
        .from("admin_alerts")
        .select("id, repeat_count")
        .eq("event", def.key)
        .gte("created_at", since)
        .in("delivery", ["emailed", "digested", "pending"])
        .order("created_at", { ascending: false })
        .limit(1);
      q = dedupeKey ? q.eq("dedupe_key", dedupeKey) : q.is("dedupe_key", null);
      const { data: recent } = await q.maybeSingle();

      if (recent) {
        // Best-effort: a lost count is cosmetic, and there is no transaction to
        // make this atomic anyway. Two workers racing here both bump from the
        // same base and one increment is lost — acceptable for a founder tool.
        await admin
          .from("admin_alerts")
          .update({
            repeat_count: (Number(recent.repeat_count) || 1) + 1,
            last_seen_at: new Date().toISOString(),
          })
          .eq("id", recent.id);
        return { logged: true, delivery: "suppressed", reason: `throttled:${throttleMinutes}m` };
      }
    }

    // ── Log first ───────────────────────────────────────────────────────────
    const { data: row, error } = await admin
      .from("admin_alerts")
      .insert({
        event: def.key,
        category: def.category,
        severity,
        title,
        summary,
        context,
        link: input.link ?? null,
        dedupe_key: dedupeKey,
        delivery: decision.action === "email" ? "pending" : decision.action === "digest" ? "pending" : "dropped",
        delivery_reason: decision.reason,
      })
      .select("id")
      .maybeSingle();

    if (error || !row) {
      console.warn(`[alerts] ${def.key}: failed to record alert:`, error?.message);
      return { logged: false, delivery: "error", reason: "insert_failed" };
    }

    if (decision.action === "drop") {
      return { logged: true, delivery: "dropped", reason: decision.reason };
    }
    if (decision.action === "digest") {
      // Left `pending`; /api/cron/admin-digest picks it up and flips it to
      // `digested` once the roll-up is actually sent.
      return { logged: true, delivery: "pending", reason: decision.reason };
    }

    // ── Email now ───────────────────────────────────────────────────────────
    const recipients = resolveRecipients(prefs);
    if (recipients.length === 0 || !emailConfigured()) {
      const reason = recipients.length === 0 ? "no_recipients" : "email_not_configured";
      await admin
        .from("admin_alerts")
        .update({ delivery: "dropped", delivery_reason: reason })
        .eq("id", row.id);
      return { logged: true, delivery: "dropped", reason };
    }

    const sent = await sendAlertEmail(recipients, {
      event: def.key,
      category: def.category,
      severity,
      title,
      summary,
      context,
      link: input.link ?? null,
    });

    await admin
      .from("admin_alerts")
      .update({
        delivery: sent ? "emailed" : "failed",
        delivery_reason: sent ? decision.reason : "send_rejected",
        emailed_at: sent ? new Date().toISOString() : null,
        recipients: sent ? recipients : [],
      })
      .eq("id", row.id);

    return sent
      ? { logged: true, delivery: "emailed", reason: decision.reason }
      : { logged: true, delivery: "failed", reason: "send_rejected" };
  } catch (err) {
    // The catch-all that makes the contract true.
    console.warn(`[alerts] ${event} threw:`, err instanceof Error ? err.message : err);
    return { logged: false, delivery: "error", reason: "threw" };
  }
}
