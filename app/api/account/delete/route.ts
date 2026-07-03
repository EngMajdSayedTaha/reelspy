import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getIgCredentials } from "@/lib/instagram/token-store";
import { deleteR2Object } from "@/lib/storage/r2";

// POST /api/account/delete — PDPL right to erasure. Permanently deletes the
// account and everything hanging off it. Order:
//   1. Revoke the Meta access token (Graph DELETE /me/permissions) — best-effort.
//   2. Delete the user's uploaded videos from R2 — best-effort per object.
//   3. auth.admin.deleteUser() — the profiles row cascades (every user table is
//      `on delete cascade` from profiles), so all app rows go with it.
// POST + a typed confirmation guards against accidental/CSRF deletion.

const GRAPH_VERSION = "v23.0";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Require an explicit typed confirmation so a stray request can't wipe an account.
  let confirm: unknown;
  try {
    confirm = (await request.json())?.confirm;
  } catch {
    confirm = undefined;
  }
  if (confirm !== "DELETE") {
    return NextResponse.json(
      { error: 'Confirmation required. Send { "confirm": "DELETE" }.' },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // 1. Revoke Meta permissions so our token can no longer touch their account.
  try {
    const ig = await getIgCredentials(admin, user.id);
    if (ig?.token) {
      await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/me/permissions?access_token=${encodeURIComponent(ig.token)}`,
        { method: "DELETE" }
      );
    }
  } catch (err) {
    console.warn("[account/delete] Meta permission revoke failed:", err instanceof Error ? err.message : err);
  }

  // 2. Delete uploaded publish videos (and thumbnails) from R2 — best-effort.
  try {
    const { data: posts } = await admin
      .from("publish_posts")
      .select("video_path, thumbnail_path")
      .eq("user_id", user.id)
      .returns<{ video_path: string | null; thumbnail_path: string | null }[]>();
    const paths = new Set<string>();
    for (const p of posts ?? []) {
      if (p.video_path) paths.add(p.video_path);
      if (p.thumbnail_path) paths.add(p.thumbnail_path);
    }
    await Promise.all(
      [...paths].map((key) =>
        deleteR2Object(key).catch((err) =>
          console.warn(`[account/delete] R2 delete ${key} failed:`, err instanceof Error ? err.message : err)
        )
      )
    );
  } catch (err) {
    console.warn("[account/delete] R2 cleanup failed:", err instanceof Error ? err.message : err);
  }

  // 3. Clear the instrumentation tables that don't cascade. app_events and
  //    ai_usage (L5) are keyed by user_id with NO foreign key to profiles, so
  //    neither the profiles delete nor deleteUser would remove them — do it
  //    explicitly so the erasure is complete.
  await Promise.all([
    admin.from("app_events").delete().eq("user_id", user.id),
    admin.from("ai_usage").delete().eq("user_id", user.id),
  ]);

  // 4. Delete the profiles row explicitly. Every app table references
  //    profiles(id) ON DELETE CASCADE, so this wipes accounts, reels, scripts,
  //    automations, posts/jobs, and connections in one shot — and it doesn't
  //    depend on whether profiles→auth.users cascades.
  const { error: profileErr } = await admin.from("profiles").delete().eq("id", user.id);
  if (profileErr) {
    console.error("[account/delete] profile delete failed:", profileErr.message);
    return NextResponse.json(
      { error: "Could not delete your account. Please contact support." },
      { status: 500 }
    );
  }

  // 5. Delete the auth user (removes the login + cascades subscriptions /
  //    user_monthly_usage, which reference auth.users ON DELETE CASCADE).
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("[account/delete] deleteUser failed:", error.message);
    return NextResponse.json(
      { error: "Could not delete your account. Please contact support." },
      { status: 500 }
    );
  }

  // Best-effort: clear the now-orphaned session cookies.
  try {
    await supabase.auth.signOut();
  } catch {
    // The user is already gone; ignore.
  }

  return NextResponse.json({ ok: true });
}
