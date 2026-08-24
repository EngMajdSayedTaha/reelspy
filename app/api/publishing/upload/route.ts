import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { presignPutUrl, r2Configured } from "@/lib/storage/r2";
import { consumeUserAction, rateLimitMessage } from "@/lib/utils/user-rate-limit";
import { numEnv } from "@/lib/utils/env";
import {
  ALL_UPLOAD_MIME_TYPES,
  extensionForMime,
  itemKindForMime,
} from "@/lib/publishing/capabilities";

// Issues a one-time presigned PUT URL for the private Cloudflare R2 bucket. The
// browser uploads the file straight to R2 with this URL, so media bytes never
// pass through our server — and R2 has no per-file size cap, which is what
// fixes the 413 "payload too large" on real reels.
//
// The object is namespaced under `{user_id}/` so deletes/listing can be scoped
// per user; R2 itself is private and only reachable via presigned URLs.
//
// Accepts photos as well as video (carousels), with the allowlist derived from
// lib/publishing/capabilities.ts — the same table the composer and the platform
// adapters read, so a format can never be uploadable but unpublishable.

const MB = 1024 * 1024;

/** Ceilings we impose. Generous vs. every platform's own cap, since the
 *  per-platform limits are enforced by the validator against the SELECTED
 *  targets; this is only here so a stray 8 GB file can't be handed a presigned
 *  URL at all. Previously there was no size check anywhere. */
function maxBytesFor(kind: "image" | "video"): number {
  return kind === "image"
    ? numEnv("PUBLISH_MAX_IMAGE_MB", 25) * MB
    : numEnv("PUBLISH_MAX_VIDEO_MB", 2048) * MB;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!r2Configured()) {
    return NextResponse.json(
      { error: "Media storage is not configured. Set the R2_* environment variables." },
      { status: 500 }
    );
  }

  let body: { contentType?: string; fileName?: string; bytes?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const contentType = body.contentType ?? "video/mp4";
  if (!ALL_UPLOAD_MIME_TYPES.includes(contentType)) {
    return NextResponse.json(
      { error: `Unsupported file type. Accepted: ${ALL_UPLOAD_MIME_TYPES.join(", ")}.` },
      { status: 400 }
    );
  }

  const kind = itemKindForMime(contentType);
  const extension = extensionForMime(contentType);
  if (!kind || !extension) {
    return NextResponse.json({ error: "Unsupported file type." }, { status: 400 });
  }

  const maxBytes = maxBytesFor(kind);
  if (typeof body.bytes === "number" && body.bytes > maxBytes) {
    return NextResponse.json(
      {
        error: `That file is ${Math.round(body.bytes / MB)} MB — the limit is ${Math.round(
          maxBytes / MB
        )} MB.`,
      },
      { status: 413 }
    );
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

  const path = `${user.id}/${randomUUID()}.${extension}`;

  try {
    const uploadUrl = await presignPutUrl(path, contentType);
    return NextResponse.json({ path, uploadUrl, contentType, kind });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create upload URL.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
