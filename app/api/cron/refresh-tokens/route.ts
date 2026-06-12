import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  exchangeForLongLivedToken,
  getInstagramBusinessAccount,
  isInvalidTokenError,
} from "@/lib/instagram/graph-api";
import { storePageCredentials } from "@/lib/instagram/token-store";
import { cronAuthorized } from "@/lib/utils/cron";
import { numEnv } from "@/lib/utils/env";

// Scheduled worker: keeps long-lived Facebook tokens alive. They last ~60 days;
// re-running fb_exchange_token before expiry mints a fresh one. Tokens that
// can't be refreshed (revoked, password change) are flagged 'invalid' so the UI
// can prompt the creator to reconnect instead of silently failing every sync.
export const runtime = "nodejs";
export const maxDuration = 120;

const REFRESH_WINDOW_DAYS = numEnv("TOKEN_REFRESH_WINDOW_DAYS", 7);

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const cutoffIso = new Date(Date.now() + REFRESH_WINDOW_DAYS * 86400 * 1000).toISOString();

  // Active tokens that are expiring soon (or have no recorded expiry yet).
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, ig_access_token, ig_token_expires_at")
    .eq("ig_token_status", "active")
    .not("ig_access_token", "is", null)
    .or(`ig_token_expires_at.is.null,ig_token_expires_at.lte.${cutoffIso}`);

  let refreshed = 0;
  let invalidated = 0;

  for (const profile of profiles ?? []) {
    if (!profile.ig_access_token) continue;

    try {
      const { accessToken, expiresInSeconds } = await exchangeForLongLivedToken(
        profile.ig_access_token
      );
      const expiresAt = expiresInSeconds
        ? new Date(Date.now() + expiresInSeconds * 1000).toISOString()
        : null;

      await admin
        .from("profiles")
        .update({
          ig_access_token: accessToken,
          ig_token_expires_at: expiresAt,
          ig_token_status: "active",
          ig_token_refreshed_at: new Date().toISOString(),
        })
        .eq("id", profile.id);
      refreshed += 1;

      // Keep the stored page token (Auto-Reply DMs) consistent with the fresh
      // user token. Best-effort: a miss here just means the old page token
      // keeps working until the next run.
      try {
        const igAccount = await getInstagramBusinessAccount(accessToken);
        if (igAccount?.pageId && igAccount.pageAccessToken) {
          await storePageCredentials(admin, profile.id, {
            pageId: igAccount.pageId,
            pageName: igAccount.pageName ?? null,
            pageToken: igAccount.pageAccessToken,
          });
        }
      } catch (pageError) {
        console.error("Page token re-derivation failed", pageError);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Only flag invalid on genuine token failures; transient errors retry next run.
      if (isInvalidTokenError(message)) {
        await admin.from("profiles").update({ ig_token_status: "invalid" }).eq("id", profile.id);
        invalidated += 1;
      }
    }
  }

  return NextResponse.json({ ok: true, candidates: profiles?.length ?? 0, refreshed, invalidated });
}
