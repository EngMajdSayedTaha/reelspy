import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { completePostSignIn } from "@/lib/auth/post-signin";

// POST /api/auth/post-signin — the bookkeeping half of a sign-in that happened
// in the BROWSER instead of in a route handler.
//
// /auth/callback (Google) and /auth/confirm (emailed link) verify server-side,
// so they can call completePostSignIn inline. The emailed 6-digit code is
// verified by the browser client instead — deliberately, so GoTrue's per-IP
// verification rate limit sees the real visitor rather than one shared server
// address — which leaves the profile row and the `signed_up` funnel event
// unwritten. This endpoint closes that gap using the session cookies the
// browser client just wrote.
//
// Auth is the session itself: no session, nothing to do. There is no way to
// run this for somebody else.

export const runtime = "nodejs";

export async function POST() {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const failure = await completePostSignIn(supabase, user);
  if (failure) {
    // Already logged with full detail inside completePostSignIn.
    return NextResponse.json({ error: failure.code }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
