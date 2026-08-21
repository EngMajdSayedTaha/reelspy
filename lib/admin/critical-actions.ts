// Which admin endpoints demand a FRESH passphrase, not merely an unlocked panel.
//
// An elevation lasts hours; the window in which the founder is actually sitting
// in front of the laptop is minutes. For most of the panel that gap is fine —
// reading a user row or retrying a job is recoverable. For the handful of
// actions below it is not: they hand out admin access, move money, lock every
// customer out, delete data, or rewrite the credentials the product runs on.
// Those re-ask for the passphrase if it hasn't been typed in the last few
// minutes (ADMIN_REAUTH_WINDOW_MINUTES), which is what makes an unattended
// unlocked tab a much smaller problem than an unattended admin panel.
//
// DERIVED FROM THE URL, NOT FROM THE HANDLER. A per-route opt-in is a rule that
// silently stops being enforced the day someone adds a route and forgets the
// flag — and the routes that most need it are exactly the ones added in a hurry.
// The gate (lib/admin/auth.ts) matches every incoming admin request against this
// table, so a new endpoint is covered by the pattern that already describes its
// family, and anything genuinely new fails visibly in review instead of
// silently in production.
//
// Pure module: no imports, no I/O, fully unit-tested (test/admin/critical-actions.test.ts).

export type CriticalRule = {
  /** Matched against the pathname, e.g. "/api/admin/users/<uuid>/ban". */
  pattern: RegExp;
  /** Methods this applies to. GET is never critical: reads don't change anything. */
  methods: readonly string[];
  /** Shown in the re-auth prompt so the admin knows what they're confirming. */
  label: string;
};

// `[^/]+` stands in for a path parameter (uuid, slug, numeric id).
export const CRITICAL_ADMIN_ACTIONS: readonly CriticalRule[] = [
  // ── Handing out or taking away the keys ─────────────────────────────────
  {
    pattern: /^\/api\/admin\/users\/[^/]+\/admin-flag$/,
    methods: ["POST"],
    label: "change who has admin access",
  },
  // ── Everyone at once ────────────────────────────────────────────────────
  {
    pattern: /^\/api\/admin\/users\/force-reset-all$/,
    methods: ["POST"],
    label: "force a password reset on every account",
  },
  // ── Acting against one customer's account ───────────────────────────────
  {
    pattern: /^\/api\/admin\/users\/[^/]+\/ban$/,
    methods: ["POST"],
    label: "ban or unban an account",
  },
  {
    pattern: /^\/api\/admin\/users\/[^/]+\/force-reset$/,
    methods: ["POST"],
    label: "force a password reset",
  },
  {
    pattern: /^\/api\/admin\/users\/[^/]+$/,
    methods: ["DELETE"],
    label: "delete an account and all of its data",
  },
  // ── Money ───────────────────────────────────────────────────────────────
  {
    pattern: /^\/api\/admin\/billing\/subscriptions\/[^/]+\/refund$/,
    methods: ["POST"],
    label: "issue a refund",
  },
  {
    pattern: /^\/api\/admin\/users\/[^/]+\/tier$/,
    methods: ["POST"],
    label: "override a customer's plan",
  },
  // ── Destroying content ──────────────────────────────────────────────────
  {
    pattern: /^\/api\/admin\/content\/[^/]+\/[^/]+$/,
    methods: ["DELETE"],
    label: "delete a content row",
  },
  // ── Credentials and app-wide switches ───────────────────────────────────
  {
    // The shared Instagram session cookies the whole product scrapes with.
    pattern: /^\/api\/admin\/ig-cookies$/,
    methods: ["POST"],
    label: "replace the Instagram session cookies",
  },
  {
    pattern: /^\/api\/admin\/ops\/settings$/,
    methods: ["PUT"],
    label: "change app-wide operational settings",
  },
  // ── The step-up system defending itself ─────────────────────────────────
  // The rotate endpoint enforces its own, stricter proof (the CURRENT
  // passphrase, plus a live elevation) because it also serves the enrollment
  // path and so runs on the identity gate. The rule is here anyway: it states
  // the intent, and it keeps holding if that route ever moves onto the shared
  // gate like every other mutation.
  {
    pattern: /^\/api\/admin\/security\/passphrase$/,
    methods: ["POST"],
    label: "change the admin passphrase",
  },
];

/**
 * Does this request need the passphrase to have been entered recently?
 * `pathname` is the URL path only (no query string).
 */
export function isCriticalAdminAction(method: string, pathname: string): boolean {
  return criticalActionLabel(method, pathname) !== null;
}

/** The human label for the matching rule, or null when the action isn't critical. */
export function criticalActionLabel(method: string, pathname: string): string | null {
  const upper = method.toUpperCase();
  // Trailing slashes and duplicate separators are normalized away first so
  // "/api/admin/users/x/ban/" can't slip past the patterns.
  const path = pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "") || "/";
  for (const rule of CRITICAL_ADMIN_ACTIONS) {
    if (rule.methods.includes(upper) && rule.pattern.test(path)) return rule.label;
  }
  return null;
}
