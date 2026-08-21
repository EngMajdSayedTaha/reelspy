// The catalog of things that are worth waking the founder up for.
//
// ONE registry, imported by the dispatcher, the admin UI and the email
// templates alike, so a new alert is added in exactly one place and every
// surface picks it up: the preference matrix renders from this array, the
// settings validator accepts only keys that appear in it, and the digest groups
// by the categories declared here.
//
// Adding an event = add an entry below + call `notifyAdmins(<key>, …)` from the
// code path that detects it. Nothing else has to change.
//
// Pure data + pure helpers: no imports, no I/O, safe on the client (the admin
// preferences page renders labels straight out of it).

export const SEVERITIES = ["info", "warning", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];

// Ordered weakest → strongest so a "minimum severity" filter is a comparison.
export function severityRank(severity: Severity): number {
  return SEVERITIES.indexOf(severity);
}

export const ALERT_CATEGORIES = ["growth", "revenue", "reliability", "security", "abuse"] as const;
export type AlertCategory = (typeof ALERT_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<AlertCategory, string> = {
  growth: "Growth",
  revenue: "Revenue",
  reliability: "Reliability",
  security: "Security",
  abuse: "Abuse & spam",
};

export const CATEGORY_HINTS: Record<AlertCategory, string> = {
  growth: "People arriving: waiting-list applications, new accounts, churned accounts.",
  revenue: "Money moving: new subscriptions, failed payments, cancellations, disputes.",
  reliability: "The product breaking: dead jobs, failing crons, unhealthy integrations.",
  security: "Privileged changes: admin access granted, accounts banned, forced resets.",
  abuse: "Someone hammering a public endpoint — bots on the join form, scripted signups.",
};

export type AlertEventDef = {
  key: string;
  category: AlertCategory;
  /** Shown in the preference matrix and as the alert's default title prefix. */
  label: string;
  /** One line: what actually triggers it, in the founder's language. */
  description: string;
  severity: Severity;
  /** Whether this event is on at all when nobody has configured anything. */
  defaultEnabled: boolean;
  /**
   * Default routing: `true` batches into the periodic digest instead of sending
   * one email per occurrence. Set for anything high-volume and non-urgent — a
   * founder who gets 40 separate "someone joined the waiting list" emails stops
   * reading the alerts entirely, which is worse than not sending them.
   */
  defaultDigest: boolean;
  /**
   * Default suppression window, in minutes. A repeat of the SAME alert inside
   * the window is folded into the first one (counted, not re-sent). 0 = never
   * suppress. Sized per-event: a dead job queue can page once an hour, a broken
   * integration once a day.
   */
  defaultThrottleMinutes: number;
};

// The registry. Order within a category is the order the UI renders.
export const ALERT_EVENTS: AlertEventDef[] = [
  // ── Growth ───────────────────────────────────────────────────────────────
  {
    key: "waitlist.joined",
    category: "growth",
    label: "Someone joined the waiting list",
    description: "A new application landed on the waiting list from the landing page or signup.",
    severity: "info",
    defaultEnabled: true,
    defaultDigest: true,
    defaultThrottleMinutes: 0,
  },
  {
    key: "user.signed_up",
    category: "growth",
    label: "New account created",
    description: "Someone finished signup and reached the product for the first time.",
    severity: "info",
    defaultEnabled: true,
    defaultDigest: true,
    defaultThrottleMinutes: 0,
  },
  {
    key: "user.deleted_account",
    category: "growth",
    label: "Account deleted",
    description: "A user erased their account and data. Worth reading every one of these.",
    severity: "warning",
    defaultEnabled: true,
    defaultDigest: false,
    defaultThrottleMinutes: 0,
  },

  // ── Revenue ──────────────────────────────────────────────────────────────
  {
    key: "billing.subscription_started",
    category: "revenue",
    label: "New paid subscription",
    description: "A checkout completed and a subscription went active.",
    severity: "info",
    defaultEnabled: true,
    defaultDigest: false,
    defaultThrottleMinutes: 0,
  },
  {
    key: "billing.payment_failed",
    category: "revenue",
    label: "Payment failed",
    description: "Stripe could not charge a customer. Dunning has started; the account is at risk.",
    severity: "warning",
    defaultEnabled: true,
    defaultDigest: false,
    // A week, because Stripe's smart retries spread four attempts on the SAME
    // invoice across roughly two — and four emails about one dying card say
    // nothing the first one didn't. Folding is per invoice (the dedupe key), so
    // a different customer failing is always its own alert.
    defaultThrottleMinutes: 7 * 24 * 60,
  },
  {
    key: "billing.subscription_canceled",
    category: "revenue",
    label: "Subscription canceled",
    description: "A paying customer's subscription ended or was scheduled to end.",
    severity: "warning",
    defaultEnabled: true,
    defaultDigest: false,
    defaultThrottleMinutes: 0,
  },
  {
    key: "billing.dispute_opened",
    category: "revenue",
    label: "Chargeback opened",
    description: "A customer disputed a charge. Stripe's evidence deadline starts now.",
    severity: "critical",
    defaultEnabled: true,
    defaultDigest: false,
    defaultThrottleMinutes: 0,
  },
  {
    key: "billing.refund_issued",
    category: "revenue",
    label: "Refund issued",
    description: "A charge was refunded, from the admin panel or the Stripe dashboard.",
    severity: "info",
    defaultEnabled: true,
    defaultDigest: true,
    defaultThrottleMinutes: 0,
  },

  // ── Reliability ──────────────────────────────────────────────────────────
  {
    key: "job.failed",
    category: "reliability",
    label: "Background job gave up",
    description:
      "A queued job burned every retry and parked as failed — a scheduled post, a transcript or a digest that will never run on its own.",
    severity: "warning",
    defaultEnabled: true,
    defaultDigest: false,
    defaultThrottleMinutes: 60,
  },
  {
    key: "cron.failed",
    category: "reliability",
    label: "Scheduled task failed",
    description: "A cron run errored out. Repeated failures mean the work it does is not happening.",
    severity: "critical",
    defaultEnabled: true,
    defaultDigest: false,
    defaultThrottleMinutes: 120,
  },
  {
    key: "integration.unhealthy",
    category: "reliability",
    label: "Integration unhealthy",
    description:
      "A third-party dependency stopped working — expired Instagram cookies, a revoked Meta token, a provider outage.",
    severity: "critical",
    defaultEnabled: true,
    defaultDigest: false,
    defaultThrottleMinutes: 720,
  },
  {
    key: "publish.failed",
    category: "reliability",
    label: "Publish failed",
    description:
      "A user's scheduled post was rejected by a platform. The user is emailed either way — this is the copy for you.",
    severity: "warning",
    defaultEnabled: false,
    defaultDigest: true,
    defaultThrottleMinutes: 0,
  },

  // ── Security ─────────────────────────────────────────────────────────────
  {
    key: "admin.role_granted",
    category: "security",
    label: "Admin access changed",
    description: "Someone was granted or stripped of admin rights. This should be rare and expected.",
    severity: "critical",
    defaultEnabled: true,
    defaultDigest: false,
    defaultThrottleMinutes: 0,
  },
  {
    key: "user.banned",
    category: "security",
    label: "User banned or unbanned",
    description: "An account was locked out of (or let back into) sign-in from the admin panel.",
    severity: "warning",
    defaultEnabled: true,
    defaultDigest: false,
    defaultThrottleMinutes: 0,
  },
  {
    key: "auth.force_reset_all",
    category: "security",
    label: "Password reset forced on everyone",
    description: "Every session was invalidated and all users must set a new password.",
    severity: "critical",
    defaultEnabled: true,
    defaultDigest: false,
    defaultThrottleMinutes: 0,
  },

  // ── Abuse ────────────────────────────────────────────────────────────────
  {
    key: "abuse.rate_limited",
    category: "abuse",
    label: "Public endpoint rate-limited",
    description:
      "One source hit a public form hard enough to be throttled — usually a bot farming the waiting list.",
    severity: "warning",
    defaultEnabled: true,
    defaultDigest: true,
    defaultThrottleMinutes: 60,
  },
];

export const ALERT_EVENT_KEYS = ALERT_EVENTS.map((e) => e.key);

const BY_KEY = new Map(ALERT_EVENTS.map((e) => [e.key, e]));

export function alertEvent(key: string): AlertEventDef | null {
  return BY_KEY.get(key) ?? null;
}

export function isAlertEventKey(key: string): boolean {
  return BY_KEY.has(key);
}

export function eventsByCategory(): { category: AlertCategory; events: AlertEventDef[] }[] {
  return ALERT_CATEGORIES.map((category) => ({
    category,
    events: ALERT_EVENTS.filter((e) => e.category === category),
  })).filter((group) => group.events.length > 0);
}
