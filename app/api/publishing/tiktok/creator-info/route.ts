import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveOAuthAccessToken } from "@/lib/publishing/oauth-token";
import { API_BASE, tiktokError } from "@/lib/publishing/adapters/tiktok";

// TikTok's UX guidelines require the composer to show the real creator +
// privacy options for the account you're about to post as (T4,
// 09-platform-access.md) — never a hardcoded privacy list, and the creator's
// nickname/avatar so they know which account they're posting to. This is the
// only source of truth for both: POST /v2/post/publish/creator_info/query/.
//
// Called client-side (PublishComposer) once TikTok is selected + connected;
// short-lived, not cached server-side, since privacy_level_options can change
// if the creator flips their TikTok account settings.

type CreatorInfoResponse = {
  data?: {
    creator_avatar_url?: string;
    creator_username?: string;
    creator_nickname?: string;
    privacy_level_options?: string[];
    comment_disabled?: boolean;
    duet_disabled?: boolean;
    stitch_disabled?: boolean;
    max_video_post_duration_sec?: number;
  };
  error?: { code?: string; message?: string };
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const resolved = await resolveOAuthAccessToken(admin, user.id, "tiktok");
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: 400 });
  }

  const res = await fetch(`${API_BASE}/post/publish/creator_info/query/`, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${resolved.accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({}),
  });

  const json = (await res.json().catch(() => ({}))) as CreatorInfoResponse;
  if (!res.ok || !json.data) {
    return NextResponse.json({ error: tiktokError(json.error, res.status) }, { status: 502 });
  }

  const d = json.data;
  return NextResponse.json({
    creatorAvatarUrl: d.creator_avatar_url ?? null,
    creatorUsername: d.creator_username ?? null,
    creatorNickname: d.creator_nickname ?? null,
    privacyLevelOptions: d.privacy_level_options ?? [],
    commentDisabled: Boolean(d.comment_disabled),
    duetDisabled: Boolean(d.duet_disabled),
    stitchDisabled: Boolean(d.stitch_disabled),
    maxVideoPostDurationSec: d.max_video_post_duration_sec ?? null,
  });
}
