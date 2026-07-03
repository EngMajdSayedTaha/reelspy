import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { presignPutUrl, r2Configured } from "@/lib/storage/r2";
import { consumeUserAction, rateLimitMessage } from "@/lib/utils/user-rate-limit";

// Issues a one-time presigned PUT URL for the private Cloudflare R2 bucket. The
// browser uploads the file straight to R2 with this URL (a plain fetch PUT), so
// video bytes never pass through our server — and R2 has no per-file size cap,
// which is what fixes the 413 "payload too large" on real reels.
//
// The object is namespaced under `{user_id}/` so deletes/listing can be scoped
// per user; R2 itself is private and only reachable via presigned URLs.

const ALLOWED = new Set(["video/mp4", "video/quicktime", "video/webm"]);

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!r2Configured()) {
    return NextResponse.json(
      { error: "Video storage is not configured. Set the R2_* environment variables." },
      { status: 500 }
    );
  }

  let body: { contentType?: string; fileName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const contentType = body.contentType ?? "video/mp4";
  if (!ALLOWED.has(contentType)) {
    return NextResponse.json({ error: "Only MP4, MOV, or WebM videos are supported." }, { status: 400 });
  }

  // Only genuine, well-formed presign attempts count against quota (bad
  // content-type is rejected above). Each granted URL authorizes an unbounded
  // R2 upload, so cap the rate a single user can request them.
  const limit = await consumeUserAction(supabase, user.id, "upload_presign");
  if (!limit.allowed) {
    return NextResponse.json(
      { error: rateLimitMessage("upload_presign", limit.retryAfterSeconds) },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const ext = contentType === "video/quicktime" ? "mov" : contentType === "video/webm" ? "webm" : "mp4";
  const path = `${user.id}/${randomUUID()}.${ext}`;

  try {
    const uploadUrl = await presignPutUrl(path, contentType);
    return NextResponse.json({ path, uploadUrl, contentType });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create upload URL.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
