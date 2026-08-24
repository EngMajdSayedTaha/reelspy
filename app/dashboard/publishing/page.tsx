import { redirect } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import { Settings2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Platform } from "@/lib/publishing/types";
import { readPlatformsFlag } from "@/lib/publishing/platforms-flag";
import { PublishComposer } from "@/components/publishing/PublishComposer";
import { PostList, type PostRow } from "@/components/publishing/PostList";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { PageTourButton } from "@/components/tour/PageTourButton";

type PostQueryRow = Omit<PostRow, "media_count"> & {
  publish_media: { id: string }[];
};

export default async function PublishingPage() {
  const { locale } = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  const dict = getDictionary(locale);
  const t = dict.publishing;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Connection state: IG/FB live on the profile (browser-readable metadata),
  // TikTok/YouTube/Threads in social_connections.
  const [{ data: profile }, { data: conns }, { data: posts }, platformsFlag] = await Promise.all([
    supabase.from("profiles").select("ig_user_id, fb_page_id, fb_page_name, username").eq("id", user.id).maybeSingle(),
    supabase
      .from("social_connections")
      .select("platform, account_name, account_username, token_status, is_active")
      .eq("user_id", user.id),
    supabase
      .from("publish_posts")
      .select(
        "id, title, caption, hashtags, status, media_kind, scheduled_at, created_at, publish_media(id), publish_jobs(id, platform, status, remote_url, error_message, caption)"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(25)
      .returns<PostQueryRow[]>(),
    readPlatformsFlag(createAdminClient()),
  ]);

  const connFor = (p: Platform) =>
    conns?.find((c) => c.platform === p && c.is_active && c.token_status !== "invalid");

  // Admin's flag:platforms switch folds straight into "connected": a platform
  // the founder turned off reads exactly like one the user never connected —
  // same composer UI, same "not connected" state, no new copy needed.
  const connected: Record<Platform, boolean> = {
    instagram: Boolean(profile?.ig_user_id) && platformsFlag.instagram,
    facebook: Boolean(profile?.fb_page_id) && platformsFlag.facebook,
    tiktok: Boolean(connFor("tiktok")) && platformsFlag.tiktok,
    youtube: Boolean(connFor("youtube")) && platformsFlag.youtube,
    threads: Boolean(connFor("threads")) && platformsFlag.threads,
  };

  // Shown under each platform card so the user can see WHICH account a target
  // is, not just that it's connected.
  const handles: Partial<Record<Platform, string | null>> = {
    instagram: profile?.username ? `@${profile.username}` : null,
    facebook: profile?.fb_page_name ?? null,
    tiktok: connFor("tiktok")?.account_username
      ? `@${connFor("tiktok")!.account_username}`
      : null,
    youtube: connFor("youtube")?.account_name ?? null,
    threads: connFor("threads")?.account_username
      ? `@${connFor("threads")!.account_username}`
      : null,
  };

  const previewHandle = profile?.username || user.email?.split("@")[0] || "your_account";

  // Whether each platform can actually post publicly. TikTok & YouTube force
  // private/self-only until their app audit passes; the founder flips these env
  // flags post-audit and the composer's warning disappears on its own.
  const publicAllowed: Record<Platform, boolean> = {
    instagram: true,
    facebook: true,
    tiktok: process.env.TIKTOK_ALLOW_PUBLIC === "true",
    youtube: process.env.YOUTUBE_ALLOW_PUBLIC === "true",
    threads: true,
  };

  const rows: PostRow[] = (posts ?? []).map((post) => {
    const { publish_media, ...rest } = post;
    return { ...rest, media_count: publish_media?.length ?? 1 };
  });

  // Posts that finished with at least one failed target — surface them up top so
  // a partial/failed publish isn't buried in the history list.
  const needsAttention = rows.filter(
    (p) =>
      (p.status === "partial" || p.status === "failed") &&
      p.publish_jobs.some((j) => j.status === "failed")
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-semibold text-foreground">{dict.titles.publishing}</h1>
            <PageTourButton page="publishing" />
          </div>
          <p className="text-sm text-muted-foreground">{t.subtitle}</p>
        </div>
        <Button asChild variant="outline" data-tour="connect-accounts">
          <Link href="/dashboard/connections">
            <Settings2 className="h-4 w-4" /> {dict.nav.connections}
          </Link>
        </Button>
      </div>

      <PublishComposer
        connected={connected}
        handles={handles}
        handle={previewHandle}
        publicAllowed={publicAllowed}
      />

      {needsAttention.length > 0 ? (
        <div data-tour="needs-attention" className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div className="min-w-0 text-sm">
            <p className="font-medium text-foreground">{t.postsDidntPublish(needsAttention.length)}</p>
            <p className="mt-0.5 text-muted-foreground">
              {t.reviewFailedIntro}{" "}
              <span className="font-medium text-foreground">{dict.common.retry}</span> {t.reviewFailedOutro}
            </p>
          </div>
        </div>
      ) : null}

      <PostList initialPosts={rows} />
    </div>
  );
}
