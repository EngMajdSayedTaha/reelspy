import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Issues a one-time signed upload URL for the private `publish-media` bucket.
// The browser uploads the file straight to Storage with this token
// (supabase.storage.uploadToSignedUrl), so video bytes never pass through our
// server. The object is namespaced under `{user_id}/` to match the bucket RLS.

const ALLOWED = new Set(["video/mp4", "video/quicktime", "video/webm"]);

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  const ext = contentType === "video/quicktime" ? "mov" : contentType === "video/webm" ? "webm" : "mp4";
  const path = `${user.id}/${randomUUID()}.${ext}`;

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from("publish-media")
    .createSignedUploadUrl(path);

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Could not create upload URL." }, { status: 500 });
  }

  return NextResponse.json({ path: data.path, token: data.token });
}
