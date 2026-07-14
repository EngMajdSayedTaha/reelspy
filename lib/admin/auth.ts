import "server-only";
import { NextResponse } from "next/server";
import { notFound } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/billing/admin";

// The gate every admin API route handler and admin server component runs first.
// Fails CLOSED: no session, not an admin, or any DB error → a 404 (never reveal
// that the admin surface exists). On success it returns a context bundle with
// both clients so the handler never has to re-fetch the user or re-create the
// service-role client.
//
//   const gate = await requireAdmin(request);
//   if (!gate.ok) return gate.response;
//   const { ctx } = gate;   // { user, supabase, admin, ip, userAgent }
//
// `supabase` is the RLS-scoped anon-key client (the caller's own session);
// `admin` is the service-role client for cross-user reads/writes. Always use
// `admin` for anything that isn't the calling admin's own data.

export type AdminContext = {
  user: User;
  /** RLS-scoped client bound to the admin's own session. */
  supabase: SupabaseClient;
  /** Service-role client (bypasses RLS) — cross-user reads/writes. */
  admin: SupabaseClient;
  ip: string | null;
  userAgent: string | null;
};

export type AdminGate =
  | { ok: true; ctx: AdminContext }
  | { ok: false; response: NextResponse };

// The single canonical "not found" response for the whole admin API surface.
export function adminNotFound(): NextResponse {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

function clientIp(request?: Request): string | null {
  if (!request) return null;
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return request.headers.get("x-real-ip");
}

export async function requireAdmin(request?: Request): Promise<AdminGate> {
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

// Server-component variant: throws notFound() (App Router) instead of returning
// a JSON response. Returns the same context on success.
export async function requireAdminPage(): Promise<AdminContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();
  const ok = await isAdminUser(supabase, user.id).catch(() => false);
  if (!ok) notFound();
  return {
    user,
    supabase,
    admin: createAdminClient(),
    ip: null,
    userAgent: null,
  };
}
