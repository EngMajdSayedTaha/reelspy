import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cronAuthorized } from "@/lib/utils/cron";
import {
  getConnection,
  markConnectionInvalid,
  updateConnectionTokens,
} from "@/lib/publishing/token-store";
import { refreshYouTubeToken } from "@/lib/publishing/adapters/youtube";
import { fetchVideoComments } from "@/lib/auto-reply/youtube-calls";
import { processYouTubeComment } from "@/lib/auto-reply/youtube-processor";
import type { YouTubeAutomation } from "@/lib/auto-reply/types";

// POLLING is the ONLY delivery mechanism for YouTube comment auto-reply —
// unlike Instagram, the YouTube Data API has no push webhooks for comments.
// Register this in vercel.json at a conservative cadence (every 15 min) to
// respect the ~10,000 units/day quota: commentThreads.list = 1 unit per
// automation per run, comments.insert = ~50 units per reply.
//
// Overlap-safe: processYouTubeComment dedupes on the unique comment_id, so a
// comment is only ever replied to once even if two runs race.
export const runtime = "nodejs";
export const maxDuration = 120;

type ResolvedYouTube = { accessToken: string; channelId: string | null } | null;

// One credential resolution per user (refreshing the ~1h access token when
// expired), mirroring lib/publishing/dispatcher.ts resolveCredentials.
async function resolveYouTube(
  admin: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<ResolvedYouTube> {
  const conn = await getConnection(admin, userId, "youtube").catch(() => null);
  if (!conn?.access_token) return null;

  let accessToken = conn.access_token;
  const expired =
    conn.token_expires_at != null &&
    new Date(conn.token_expires_at).getTime() <= Date.now() + 60_000;

  if (expired) {
    if (!conn.refresh_token) {
      await markConnectionInvalid(admin, conn.id);
      return null;
    }
    try {
      const r = await refreshYouTubeToken(conn.refresh_token);
      accessToken = r.accessToken;
      await updateConnectionTokens(admin, conn.id, {
        accessToken: r.accessToken,
        expiresAt: new Date(Date.now() + r.expiresInSeconds * 1000).toISOString(),
      });
    } catch {
      await markConnectionInvalid(admin, conn.id);
      return null;
    }
  }

  return { accessToken, channelId: conn.account_id };
}

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: automations } = await admin
    .from("youtube_automations")
    .select("*")
    .eq("is_active", true)
    .returns<YouTubeAutomation[]>();

  let scanned = 0;
  let actioned = 0;
  const errors: string[] = [];

  const credentialsCache = new Map<string, ResolvedYouTube>();

  for (const automation of automations ?? []) {
    let creds = credentialsCache.get(automation.user_id);
    if (creds === undefined) {
      creds = await resolveYouTube(admin, automation.user_id);
      credentialsCache.set(automation.user_id, creds);
    }
    if (!creds) continue;

    // Only ever react to comments posted AFTER the automation was created —
    // otherwise a brand-new automation would reply to the whole existing
    // comment backlog at once (quota + spam). New engagement only.
    const since = new Date(automation.created_at).getTime();

    try {
      const comments = await fetchVideoComments(automation.video_id, creds.accessToken);
      for (const comment of comments) {
        if (comment.publishedAt) {
          const published = new Date(comment.publishedAt).getTime();
          if (Number.isFinite(published) && published < since) continue;
        }
        scanned += 1;
        const result = await processYouTubeComment(
          admin,
          automation,
          comment,
          creds.accessToken,
          creds.channelId
        );
        if (result === "processed") actioned += 1;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${automation.video_id}: ${message.slice(0, 200)}`);
    }
  }

  return NextResponse.json({
    ok: true,
    automations: automations?.length ?? 0,
    scanned,
    actioned,
    errors: errors.length > 0 ? errors : undefined,
  });
}
