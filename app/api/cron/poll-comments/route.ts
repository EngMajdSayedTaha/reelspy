import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getIgCredentials } from "@/lib/instagram/token-store";
import { cronAuthorized } from "@/lib/utils/cron";
import { fetchRecentComments } from "@/lib/auto-reply/graph-calls";
import { processCommentChange } from "@/lib/auto-reply/processor";

// POLLING FALLBACK for the Auto-Reply module — webhooks are the primary
// mechanism (app/api/ig/webhooks). This route exists for the case where Meta's
// webhook delivery proves unreliable; it is intentionally NOT scheduled in
// vercel.json. To enable it, add e.g.
//   { "path": "/api/cron/poll-comments", "schedule": "*/10 * * * *" }
// Webhooks and polling can run together safely: processCommentChange dedupes
// on the unique comment_id, so a comment is only ever actioned once.
export const runtime = "nodejs";
export const maxDuration = 120;

// Private replies are only allowed within 7 days of the comment — skip
// anything close to the boundary so we never burn a comment's single DM on a
// call Meta will reject.
const MAX_COMMENT_AGE_MS = 6 * 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: automations } = await admin
    .from("reel_automations")
    .select("user_id, ig_media_id")
    .eq("is_active", true);

  let scanned = 0;
  let actioned = 0;
  const errors: string[] = [];

  // One credentials lookup per user, not per automation.
  const credentialsCache = new Map<
    string,
    Awaited<ReturnType<typeof getIgCredentials>>
  >();

  for (const automation of automations ?? []) {
    let credentials = credentialsCache.get(automation.user_id);
    if (credentials === undefined) {
      credentials = await getIgCredentials(admin, automation.user_id).catch(() => null);
      credentialsCache.set(automation.user_id, credentials);
    }
    if (!credentials) continue;

    try {
      const comments = await fetchRecentComments(automation.ig_media_id, credentials.token);
      for (const comment of comments) {
        if (!comment.id) continue;
        if (comment.timestamp) {
          const age = Date.now() - new Date(comment.timestamp).getTime();
          if (Number.isFinite(age) && age > MAX_COMMENT_AGE_MS) continue;
        }
        scanned += 1;
        const result = await processCommentChange(admin, credentials.igUserId, {
          id: comment.id,
          text: comment.text,
          from: comment.from,
          parent_id: comment.parent_id,
          media: { id: automation.ig_media_id },
        });
        if (result === "processed") actioned += 1;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${automation.ig_media_id}: ${message.slice(0, 200)}`);
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
