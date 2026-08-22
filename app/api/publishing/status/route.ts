import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Live status for posts the history list is watching.
//
// Publishing is asynchronous now — the composer returns the moment the job is
// queued, and the worker does the platform round-trips. Without this the user
// would be staring at "Publishing…" with no way to learn it finished short of
// reloading the page. The client polls this while anything is in flight and
// stops as soon as everything is terminal.
//
// Reads through the request-scoped (anon) client on purpose: RLS on
// publish_posts / publish_jobs is what scopes the answer to the caller, so
// there's no way to ask about someone else's post.

export const runtime = "nodejs";

const MAX_IDS = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type JobRow = {
  id: string;
  platform: string;
  status: string;
  remote_url: string | null;
  error_message: string | null;
};

type PostRow = {
  id: string;
  status: string;
  scheduled_at: string | null;
  updated_at: string | null;
  publish_jobs: JobRow[];
};

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ids = (new URL(request.url).searchParams.get("ids") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => UUID_RE.test(id))
    .slice(0, MAX_IDS);

  if (ids.length === 0) return NextResponse.json({ posts: [] });

  const { data, error } = await supabase
    .from("publish_posts")
    .select("id, status, scheduled_at, updated_at, publish_jobs(id, platform, status, remote_url, error_message)")
    .eq("user_id", user.id)
    .in("id", ids)
    .returns<PostRow[]>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(
    { posts: data ?? [] },
    { headers: { "cache-control": "no-store" } }
  );
}
