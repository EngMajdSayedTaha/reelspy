import "server-only";
import { NextResponse } from "next/server";
import { notFound, redirect } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/billing/admin";
import { criticalActionLabel } from "@/lib/admin/critical-actions";
import {
  isReauthFresh,
  readElevationToken,
  touchElevation,
  verifyElevation,
  type ElevationSession,
} from "@/lib/admin/elevation";

// The gate every admin API route handler and admin server component runs first.
// Fails CLOSED: no session, not an admin, or any DB error → a 404 (never reveal
// that the admin surface exists). On success it returns a context bundle with
// both clients so the handler never has to re-fetch the user or re-create the
// service-role client.
//
//   const gate = await requireAdmin(request);
//   if (!gate.ok) return gate.response;
//   const { ctx } = gate;   // { user, supabase, admin, elevation, ip, userAgent }
//
// `supabase` is the RLS-scoped anon-key client (the caller's own session);
// `admin` is the service-role client for cross-user reads/writes. Always use
// `admin` for anything that isn't the calling admin's own data.
//
// ── Two facts, not one ─────────────────────────────────────────────────────
// `profiles.is_admin` answers "MAY this person administer?" — an authorization
// fact, permanent, and true of a stolen session too. It was never evidence that
// the request in front of us is really the founder. So every call here checks a
// second, independent fact: a live ELEVATION (lib/admin/elevation.ts), minted
// only by entering the admin passphrase, short-lived, and revocable. A stolen
// laptop, a leaked access token or an XSS-lifted cookie now buys an attacker a
// 404 unless they also know a secret that never travels with the session.
//
// Three failure shapes, deliberately different:
//   not an admin      → 404, always. The panel does not exist for you.
//   admin, no unlock  → 403 `elevation_required`. It exists; go unlock it.
//   admin, stale      → 403 `reauth_required`. Type the passphrase again for
//                       this one high-blast-radius action.

export type AdminContext = {
  user: User;
  /** RLS-scoped client bound to the admin's own session. */
  supabase: SupabaseClient;
  /** Service-role client (bypasses RLS) — cross-user reads/writes. */
  admin: SupabaseClient;
  /** The live elevation this request is riding on. */
  elevation: ElevationSession;
  ip: string | null;
  userAgent: string | null;
};

/** Identity only: a signed-in admin, with no elevation checked or required. */
export type AdminIdentity = {
  user: User;
  supabase: SupabaseClient;
  admin: SupabaseClient;
  ip: string | null;
  userAgent: string | null;
};

export type AdminGate =
  | { ok: true; ctx: AdminContext }
  | { ok: false; response: NextResponse };

export type AdminIdentityGate =
  | { ok: true; ctx: AdminIdentity }
  | { ok: false; response: NextResponse };

// The single canonical "not found" response for the whole admin API surface.
export function adminNotFound(): NextResponse {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

/** 403 telling an authenticated admin to unlock the panel. */
export function elevationRequired(): NextResponse {
  return NextResponse.json(
    {
      error: "Unlock the admin panel with your admin passphrase to continue.",
      code: "elevation_required",
    },
    { status: 403 }
  );
}

/** 403 telling an unlocked admin to re-enter the passphrase for THIS action. */
export function reauthRequired(action: string): NextResponse {
  return NextResponse.json(
    {
      error: `Confirm your admin passphrase to ${action}.`,
      code: "reauth_required",
      action,
    },
    { status: 403 }
  );
}

function clientIp(request?: Request): string | null {
  if (!request) return null;
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return request.headers.get("x-real-ip");
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Cross-site requests can't carry the elevation cookie at all (SameSite=Strict),
// so this is the second lock on an already-locked door — cheap, and it holds if
// a future change ever loosens that cookie. Only an Origin that is present AND
// foreign is rejected: some non-browser callers (curl during an incident) send
// none, and rejecting those would break the panel without stopping an attack.
function isCrossOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return true;
  }
  const allowed = new Set<string>();
  try {
    allowed.add(new URL(request.url).host);
  } catch {
    // Unparseable request URL — fall through to the configured site host.
  }
  const host = request.headers.get("host");
  if (host) allowed.add(host);
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (site) {
    try {
      allowed.add(new URL(site).host);
    } catch {
      // Misconfigured env: ignore rather than lock the admin out.
    }
  }
  return !allowed.has(originHost);
}

/**
 * Signed-in `is_admin` user, WITHOUT the elevation requirement. Used only by
 * the endpoints whose whole job is to establish elevation (unlock, setup,
 * status) — everything else must use `requireAdmin`.
 */
export async function requireAdminIdentity(request?: Request): Promise<AdminIdentityGate> {
  const supabase = await createClient();

  let user: User | null = null;
  try {
    const {
      data: { user: u },
    } = await supabase.auth.getUser();
    user = u;
  } catch {
    return { ok: false, response: adminNotFound() };
  }
  if (!user) return { ok: false, response: adminNotFound() };

  // isAdminUser fails closed internally, but guard again so an unexpected throw
  // never surfaces the admin API to a non-admin.
  let admin: boolean;
  try {
    admin = await isAdminUser(supabase, user.id);
  } catch {
    return { ok: false, response: adminNotFound() };
  }
  if (!admin) return { ok: false, response: adminNotFound() };

  if (request && !SAFE_METHODS.has(request.method.toUpperCase()) && isCrossOrigin(request)) {
    return { ok: false, response: adminNotFound() };
  }

  return {
    ok: true,
    ctx: {
      user,
      supabase,
      admin: createAdminClient(),
      ip: clientIp(request),
      userAgent: request?.headers.get("user-agent") ?? null,
    },
  };
}

export async function requireAdmin(request?: Request): Promise<AdminGate> {
  const identity = await requireAdminIdentity(request);
  if (!identity.ok) return identity;
  const { user, supabase, admin, ip, userAgent } = identity.ctx;

  // Anything other than a clean "ok" — no cookie, expired, idled out, revoked,
  // another admin's, a thrown DB error, an unexpected shape — denies. Written
  // as "only this one value passes" rather than a list of rejections, so a new
  // failure mode can't accidentally read as success.
  let session: ElevationSession | null = null;
  try {
    const check = await verifyElevation(admin, user.id, await readElevationToken());
    if (check?.status === "ok") session = check.session;
  } catch {
    session = null;
  }
  if (!session) return { ok: false, response: elevationRequired() };

  // High-blast-radius endpoints need the passphrase to have been typed in the
  // last few minutes, not just at some point today. Derived from the URL so a
  // new route in a protected family is covered without anyone remembering to
  // opt in — see lib/admin/critical-actions.ts.
  if (request) {
    let pathname: string | null = null;
    try {
      pathname = new URL(request.url).pathname;
    } catch {
      pathname = null;
    }
    if (pathname) {
      const critical = criticalActionLabel(request.method, pathname);
      if (critical && !isReauthFresh(session)) {
        return { ok: false, response: reauthRequired(critical) };
      }
    }
  }

  await touchElevation(admin, session);

  return { ok: true, ctx: { user, supabase, admin, elevation: session, ip, userAgent } };
}

/**
 * Server-component variant. A non-admin gets notFound() (App Router), same as
 * the API. An admin without a live elevation is REDIRECTED to /admin/unlock
 * rather than 404'd: they are allowed to be here, they just have to prove it,
 * and a 404 would read as "the panel is broken".
 */
export async function requireAdminPage(nextPath?: string): Promise<AdminContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();
  const ok = await isAdminUser(supabase, user.id).catch(() => false);
  if (!ok) notFound();

  const admin = createAdminClient();
  let session: ElevationSession | null = null;
  try {
    const check = await verifyElevation(admin, user.id, await readElevationToken());
    if (check?.status === "ok") session = check.session;
  } catch {
    session = null;
  }
  if (!session) {
    redirect(nextPath ? `/admin/unlock?next=${encodeURIComponent(nextPath)}` : "/admin/unlock");
  }

  await touchElevation(admin, session);

  return {
    user,
    supabase,
    admin,
    elevation: session,
    ip: null,
    userAgent: null,
  };
}

/** Server-component identity gate for the unlock/setup pages themselves. */
export async function requireAdminIdentityPage(): Promise<AdminIdentity> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();
  const ok = await isAdminUser(supabase, user.id).catch(() => false);
  if (!ok) notFound();
  return { user, supabase, admin: createAdminClient(), ip: null, userAgent: null };
}
