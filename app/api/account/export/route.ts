import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeUserAction } from "@/lib/utils/user-rate-limit";

// GET /api/account/export — PDPL data-subject access. Returns a JSON bundle of
// the user's own rows across every table they own. Tokens/secrets are excluded:
// `profiles` and `social_connections` are read with an explicit safe column list,
// never `*`. Rate-limited (account_export) so it can't be used to hammer the DB.

export const dynamic = "force-dynamic";

// Safe (non-secret) profile columns — deliberately omits ig_access_token,
// fb_page_access_token, and other credential fields.
const PROFILE_COLUMNS =
  "id, username, ig_user_id, ig_token_status, ig_token_expires_at, ig_token_refreshed_at, fb_page_id, fb_page_name, webhook_subscribed_at, brand_voice, onboarded_at, created_at";

const CONNECTION_COLUMNS =
  "id, platform, account_id, account_name, account_username, avatar_url, token_status, token_expires_at, scopes, is_active, created_at, updated_at";

// Tables exported with all columns — none of these hold secrets.
const USER_TABLES = [
  "account_groups",
  "inspiration_accounts",
  "tracked_reels",
  "generated_scripts",
  "reel_automations",
  "dm_automations",
  "youtube_automations",
  "publish_posts",
  "publish_jobs",
  "app_events",
] as const;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = await consumeUserAction(supabase, user.id, "account_export");
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many export requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const admin = createAdminClient();

  const bundle: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
    user: { id: user.id, email: user.email },
  };

  const [{ data: profile }, { data: connections }] = await Promise.all([
    admin.from("profiles").select(PROFILE_COLUMNS).eq("id", user.id).maybeSingle(),
    admin.from("social_connections").select(CONNECTION_COLUMNS).eq("user_id", user.id),
  ]);
  bundle.profile = profile ?? null;
  bundle.social_connections = connections ?? [];

  const results = await Promise.all(
    USER_TABLES.map((table) => admin.from(table).select("*").eq("user_id", user.id))
  );
  USER_TABLES.forEach((table, i) => {
    bundle[table] = results[i].data ?? [];
  });

  const filename = `reelspy-export-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(bundle, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
