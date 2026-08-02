import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  issueConfirmationCode,
  parseSignedRequest,
} from "@/lib/meta/signed-request";
import { clearIgToken, findUserIdByFacebookUserId } from "@/lib/instagram/token-store";
import { getSiteUrl } from "@/lib/site";
import { oauthError, oauthLog } from "@/lib/oauth/log";

// Meta **Data Deletion Request Callback** — App Dashboard → App Settings → Basic.
//
// Meta POSTs here when a user asks Facebook to delete the data an app holds
// about them. The response MUST be JSON shaped exactly:
//
//     { "url": "<status page the user can open>", "confirmation_code": "<id>" }
//
// A working callback is a prerequisite for Advanced Access
// (Plan_Reelspy/09-platform-access.md → P1.1).
//
// SCOPE — WHY THIS IS NOT "DELETE THE ACCOUNT"
// -------------------------------------------
// The request is "delete the data you obtained from Meta", not "close my
// ReelSpy account". Those are different asks, and conflating them would destroy
// the user's own work — the scripts they wrote, their brand voice, their
// billing history — on the strength of an unauthenticated POST. So this erases
// everything Meta-DERIVED and leaves the account standing:
//
//   * Meta credentials — user token, Page token, ig_connections   (clearIgToken)
//   * Instagram/Facebook publishing connections                   (social_connections)
//   * Everything read through Business Discovery — the tracked accounts and the
//     reels/metrics pulled from them                              (inspiration_accounts →
//                                                                  tracked_reels cascade)
//
// Full account erasure remains available, session-authenticated and
// confirmation-gated, at POST /api/account/delete (PDPL right to erasure).
//
// SECURITY: unauthenticated. `signed_request` is the only proof of origin, so an
// invalid signature deletes nothing. See lib/meta/signed-request.ts.

export const runtime = "nodejs";
export const maxDuration = 60;

const STATUS_PATH = "/meta/data-deletion";

export async function POST(request: Request) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    oauthError({ flow: "meta", step: "data-deletion:env-missing" });
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  let signedRequest: string | null = null;
  try {
    const form = await request.formData();
    signedRequest = form.get("signed_request")?.toString() ?? null;
  } catch {
    signedRequest = null;
  }

  const parsed = parseSignedRequest(signedRequest, appSecret);
  if (!parsed.ok) {
    oauthError({ flow: "meta", step: "data-deletion:invalid-signature", reason: parsed.reason });
    return NextResponse.json({ error: "invalid_signed_request" }, { status: 400 });
  }

  const fbUserId = parsed.payload.user_id;
  const admin = createAdminClient();
  const userId = fbUserId ? await findUserIdByFacebookUserId(admin, fbUserId) : null;

  if (userId) {
    try {
      await deleteMetaDerivedData(admin, userId);
      oauthLog({ flow: "meta", step: "data-deletion:completed", userId });
    } catch (err) {
      oauthError({
        flow: "meta",
        step: "data-deletion:failed",
        userId,
        reason: err instanceof Error ? err.message : String(err),
      });
      // Retryable: Meta re-sends, and the confirmation code must not claim a
      // deletion that didn't happen.
      return NextResponse.json({ error: "deletion_failed" }, { status: 500 });
    }
  } else {
    // Unknown ASID — nobody to delete. That is a completed request, not a
    // failure: answering non-2xx would make Meta retry something that can never
    // succeed, and would report an error to a user we hold no data for.
    oauthLog({ flow: "meta", step: "data-deletion:unknown-user" });
  }

  // Deletion above is synchronous, so the code can attest to a finished job.
  // It is self-verifying rather than a stored row — see issueConfirmationCode.
  const confirmationCode = issueConfirmationCode(appSecret);

  return NextResponse.json({
    url: `${getSiteUrl()}${STATUS_PATH}?code=${encodeURIComponent(confirmationCode)}`,
    confirmation_code: confirmationCode,
  });
}

// Erases every row derived from the user's Meta connection. Ordered
// child-before-parent where no cascade covers it, and each step is independent
// so one failure doesn't silently skip the rest.
async function deleteMetaDerivedData(
  admin: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<void> {
  // 1. Credentials first — the moment this returns, nothing can pull fresh Meta
  //    data back in behind the deletion (syncs and the auto-reply crons both
  //    read through these).
  await clearIgToken(admin, userId);

  // 2. Instagram/Facebook publishing connections. TikTok and YouTube rows are
  //    deliberately untouched: they are not Meta data.
  const { error: connError } = await admin
    .from("social_connections")
    .delete()
    .eq("user_id", userId)
    .in("platform", ["instagram", "facebook"]);
  if (connError) throw new Error(`social_connections: ${connError.message}`);

  // 3. Everything read out of Meta via Business Discovery. tracked_reels
  //    references inspiration_accounts ON DELETE CASCADE, so the reels, their
  //    metrics and their transcripts go with the accounts.
  const { error: accountsError } = await admin
    .from("inspiration_accounts")
    .delete()
    .eq("user_id", userId);
  if (accountsError) throw new Error(`inspiration_accounts: ${accountsError.message}`);

  // Reels can also be attached to the user with no parent account row (the
  // reel-from-link path), so sweep any that survived the cascade.
  const { error: reelsError } = await admin
    .from("tracked_reels")
    .delete()
    .eq("user_id", userId);
  if (reelsError) throw new Error(`tracked_reels: ${reelsError.message}`);
}
