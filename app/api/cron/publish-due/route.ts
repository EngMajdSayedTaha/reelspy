import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchPost } from "@/lib/publishing/dispatcher";
import { cronAuthorized } from "@/lib/utils/cron";
import { numEnv } from "@/lib/utils/env";

// Scheduled worker: publishes posts whose scheduled time has arrived. Vercel
// Cron calls this with the CRON_SECRET bearer (see vercel.json). Each due post
// is flipped to `publishing` and handed to the shared dispatcher, which is
// idempotent on pending jobs — so an overlapping run can't double-post.
export const runtime = "nodejs";
export const maxDuration = 300;

const BATCH = numEnv("PUBLISH_DUE_BATCH", 10);

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: due } = await admin
    .from("publish_posts")
    .select("id")
    .eq("status", "scheduled")
    .not("scheduled_at", "is", null)
    .lte("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: true })
    .limit(BATCH);

  let published = 0;
  let failed = 0;

  for (const post of due ?? []) {
    try {
      const result = await dispatchPost(admin, post.id);
      published += result.published;
      failed += result.failed;
    } catch (err) {
      console.error("Scheduled publish failed", post.id, err);
      await admin.from("publish_posts").update({ status: "failed" }).eq("id", post.id);
      failed += 1;
    }
  }

  return NextResponse.json({ ok: true, posts: due?.length ?? 0, published, failed });
}
