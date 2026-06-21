import { redirect } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { ConnectionCard } from "@/components/publishing/ConnectionCard";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

const ERROR_MAP: Record<string, string> = {
  invalid_state: "Sign-in could not be verified. Please try connecting again.",
  missing_code: "The provider did not return an authorization code.",
  oauth_failed: "Connection failed. Please try again.",
  tiktok_env_missing: "TikTok isn't configured on the server yet.",
  youtube_env_missing: "YouTube isn't configured on the server yet.",
  unsupported_platform: "That platform can't be connected here.",
};

function isExpired(value: string | null | undefined): boolean {
  return value ? new Date(value).getTime() <= Date.now() : false;
}

export default async function ConnectionsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const error = firstParam(params.error);
  const success = firstParam(params.success);
  const errorMessage = error ? ERROR_MAP[error] ?? "Something went wrong." : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: conns }] = await Promise.all([
    supabase
      .from("profiles")
      .select("ig_user_id, fb_page_id, username, ig_token_status, ig_token_expires_at")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("social_connections")
      .select("platform, account_username, account_name, token_status, token_expires_at, is_active")
      .eq("user_id", user.id),
  ]);

  const igConnected = Boolean(profile?.ig_user_id);
  const igNeedsReconnect =
    igConnected &&
    (profile?.ig_token_status === "invalid" || isExpired(profile?.ig_token_expires_at));

  const tiktok = conns?.find((c) => c.platform === "tiktok" && c.is_active);
  const youtube = conns?.find((c) => c.platform === "youtube" && c.is_active);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
          <Link href="/dashboard/publishing">
            <ArrowLeft className="h-4 w-4" /> Back to Publishing
          </Link>
        </Button>
        <h1 className="text-2xl sm:text-3xl font-semibold text-foreground">Connections</h1>
        <p className="text-sm text-muted-foreground">
          Connect each account ReelSpy should be able to post to.
        </p>
      </div>

      {success === "connected" ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
          <CheckCircle2 className="h-4 w-4" /> Account connected successfully.
        </div>
      ) : null}
      {errorMessage ? (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
          <AlertTriangle className="h-4 w-4" /> {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-4">
        {/* Instagram + Facebook share the Meta OAuth flow. */}
        <ConnectionCard
          platform="instagram"
          connected={igConnected}
          handle={profile?.username ? `@${profile.username}` : null}
          needsReconnect={igNeedsReconnect}
          connectHref="/api/ig/connect"
          note="Posts Reels via the Meta Graph API. Requires an IG Professional account."
        />
        <ConnectionCard
          platform="facebook"
          connected={Boolean(profile?.fb_page_id)}
          handle={profile?.fb_page_id ? "Page connected" : null}
          needsReconnect={igNeedsReconnect}
          connectHref="/api/ig/connect"
          note="Posts to your linked Facebook Page (connected with Instagram)."
        />
        <ConnectionCard
          platform="tiktok"
          connected={Boolean(tiktok)}
          handle={tiktok?.account_username ? `@${tiktok.account_username}` : null}
          needsReconnect={tiktok?.token_status === "invalid"}
          connectHref="/api/social/tiktok/connect"
          disconnectHref="/api/social/tiktok/disconnect"
          note="Posts via the TikTok Content Posting API."
        />
        <ConnectionCard
          platform="youtube"
          connected={Boolean(youtube)}
          handle={youtube?.account_name ?? null}
          needsReconnect={youtube?.token_status === "invalid"}
          connectHref="/api/social/youtube/connect"
          disconnectHref="/api/social/youtube/disconnect"
          note="Uploads via the YouTube Data API."
        />
      </div>

      <p className="rounded-lg border border-border bg-background px-4 py-3 text-xs text-subtle">
        Note: Instagram &amp; Facebook posting needs Meta App Review; TikTok and YouTube need their
        platform audits before posts can go fully public. Until then, TikTok/YouTube posts stay
        private to your own account.
      </p>
    </div>
  );
}
