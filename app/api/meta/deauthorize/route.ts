import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseSignedRequest } from "@/lib/meta/signed-request";
import { clearIgToken, findUserIdByFacebookUserId } from "@/lib/instagram/token-store";
import { oauthError, oauthLog } from "@/lib/oauth/log";

// Meta **Deauthorize Callback** — App Dashboard → App Settings → Basic.
//
// Meta POSTs here when a user removes ReelSpy from their Facebook account
// (Settings → Apps and Websites → Remove). At that instant our stored token is
// already dead on Meta's side, but WE still hold it, still show the account as
// connected, and every sync/auto-reply cron keeps burning quota on calls that
// can only fail. This endpoint closes that gap.
//
// Having it work — not merely exist — is a prerequisite for Advanced Access
// (Plan_Reelspy/09-platform-access.md → P1.1).
//
// SECURITY: the request is unauthenticated. `signed_request` is the only proof
// it came from Meta, so an invalid signature must clear nothing. See
// lib/meta/signed-request.ts.
//
// Meta retries on non-2xx and treats a slow endpoint as failed, so this always
// answers 200 to a well-formed signed request, even when the user is unknown —
// there is nothing for Meta to retry in that case.

export const runtime = "nodejs";

export async function POST(request: Request) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    oauthError({ flow: "meta", step: "deauthorize:env-missing" });
    // 500 is correct here: this IS retryable — the config, not the request, is
    // broken, and a retry after the env is set should succeed.
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  let signedRequest: string | null = null;
  try {
    const form = await request.formData();
    signedRequest = form.get("signed_request")?.toString() ?? null;
  } catch {
    // Meta sends application/x-www-form-urlencoded; anything else is not Meta.
    signedRequest = null;
  }

  const parsed = parseSignedRequest(signedRequest, appSecret);
  if (!parsed.ok) {
    oauthError({ flow: "meta", step: "deauthorize:invalid-signature", reason: parsed.reason });
    return NextResponse.json({ error: "invalid_signed_request" }, { status: 400 });
  }

  const fbUserId = parsed.payload.user_id;
  if (!fbUserId) {
    oauthError({ flow: "meta", step: "deauthorize:no-user-id" });
    return NextResponse.json({ ok: true });
  }

  const admin = createAdminClient();
  const userId = await findUserIdByFacebookUserId(admin, fbUserId);

  if (!userId) {
    // Expected for anyone who connected before migration 20260802120000 added
    // fb_user_id. Logged, not errored — Meta has nothing to do about it.
    oauthLog({ flow: "meta", step: "deauthorize:unknown-user" });
    return NextResponse.json({ ok: true });
  }

  try {
    // Clears the user token, the Page token, the webhook flag AND the
    // ig_connections rows (X4 multi-account) in one call.
    await clearIgToken(admin, userId);
    oauthLog({ flow: "meta", step: "deauthorize:cleared", userId });
  } catch (err) {
    oauthError({
      flow: "meta",
      step: "deauthorize:clear-failed",
      userId,
      reason: err instanceof Error ? err.message : String(err),
    });
    // Retryable on our side — let Meta send it again.
    return NextResponse.json({ error: "clear_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
