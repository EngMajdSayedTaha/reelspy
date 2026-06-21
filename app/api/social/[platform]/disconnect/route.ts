import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clearConnection } from "@/lib/publishing/token-store";
import { isPlatform } from "@/lib/publishing/types";

// Removes a connected TikTok/YouTube account (deletes its tokens). The row is
// removable by the owner under RLS, but we route the delete through the admin
// client for symmetry with the rest of the credential layer.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isPlatform(platform) || (platform !== "tiktok" && platform !== "youtube")) {
    return NextResponse.json({ error: "Unsupported platform" }, { status: 400 });
  }

  const admin = createAdminClient();
  await clearConnection(admin, user.id, platform);

  return NextResponse.json({ ok: true });
}
