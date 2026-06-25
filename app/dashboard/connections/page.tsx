import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, Camera, ThumbsUp, Music2, PlayCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ConnectionCard } from "@/components/publishing/ConnectionCard";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

// Merged from the old per-platform pages so every OAuth round-trip lands here.
const ERROR_MAP: Record<string, string> = {
  invalid_state: "Sign-in could not be verified. Please try connecting again.",
  missing_code: "The provider did not return an authorization code.",
  oauth_failed: "Connection failed. Please try again.",
  tiktok_env_missing: "TikTok isn't configured on the server yet.",
  youtube_env_missing: "YouTube isn't configured on the server yet.",
  unsupported_platform: "That platform can't be connected here.",
  meta_env_missing: "Instagram connection isn't configured yet. Contact support.",
  profile_update_failed: "Connected, but we couldn't save your connection. Please retry.",
  account_link_failed: "Connected, but we couldn't link your account. Please retry.",
  no_ig_business_account:
    "No Instagram Business account was found. Make sure your Instagram is a Business or Creator account linked to a Facebook Page, then reconnect.",
};

function isExpired(value: string | null | undefined): boolean {
  return value ? new Date(value).getTime() <= Date.now() : false;
}

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function ConnectionsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const error = firstParam(params.error);
  const success = firstParam(params.success);
  const detail = firstParam(params.detail);
  const errorMessage = error ? ERROR_MAP[error] ?? "Something went wrong." : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: conns }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "ig_user_id, fb_page_id, username, ig_token_status, ig_token_expires_at, ig_token_refreshed_at"
      )
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("social_connections")
      .select("platform, account_username, account_name, token_status, token_expires_at, is_active")
      .eq("user_id", user.id),
  ]);

  // ── Instagram / Facebook (Meta OAuth) ──────────────────────────────────────
  const igAppId = process.env.META_IG_APP_ID || process.env.META_APP_ID;
  const metaReady = Boolean(igAppId && process.env.META_APP_SECRET && process.env.META_REDIRECT_URI);
  const scopes = process.env.META_IG_SCOPES?.trim() || "instagram_business_basic";

  const igConnected = Boolean(profile?.ig_user_id);
  const igExpiresAt = profile?.ig_token_expires_at ?? null;
  const igNeedsReconnect =
    igConnected && (profile?.ig_token_status === "invalid" || isExpired(igExpiresAt));

  const igDetail = igNeedsReconnect
    ? "Your connection expired — reconnect to resume syncing."
    : igExpiresAt
      ? `Renews automatically · valid through ${formatDate(igExpiresAt)}`
      : "Connection active.";

  // Troubleshooting setup details only surface when there's a reason to look.
  const showSetupDetails = metaReady && (!igConnected || Boolean(errorMessage));

  // ── TikTok / YouTube (social_connections) ──────────────────────────────────
  const tiktok = conns?.find((c) => c.platform === "tiktok" && c.is_active);
  const youtube = conns?.find((c) => c.platform === "youtube" && c.is_active);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-semibold text-foreground">Connections</h1>
        <p className="text-sm text-muted-foreground">
          One place to connect and manage every social account ReelSpy works with — syncing,
          publishing and auto-reply all run off these connections.
        </p>
      </div>

      {success === "connected" ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
          <CheckCircle2 className="h-4 w-4" /> Account connected successfully.
        </div>
      ) : null}
      {success === "disconnected" ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          <AlertTriangle className="h-4 w-4" /> Account disconnected. You can reconnect below.
        </div>
      ) : null}
      {errorMessage ? (
        <div className="space-y-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> {errorMessage}
          </div>
          {detail ? (
            <p className="rounded-md border border-rose-500/20 bg-rose-500/5 p-2 font-mono text-xs text-rose-300/80">
              {detail}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4">
        {/* Instagram + Facebook share the Meta OAuth flow. */}
        <ConnectionCard
          platform="instagram"
          icon={Camera}
          connected={igConnected}
          handle={profile?.username ? `@${profile.username}` : null}
          needsReconnect={igNeedsReconnect}
          connectHref="/api/ig/connect"
          disconnectHref="/api/ig/disconnect"
          disabled={!metaReady}
          detail={
            <>
              {igDetail}
              {igConnected && profile?.ig_token_refreshed_at ? (
                <span className="mt-0.5 block text-subtle">
                  Last renewal: {formatDateTime(profile.ig_token_refreshed_at)}
                </span>
              ) : null}
            </>
          }
          note="Powers reel syncing, insights, publishing & auto-reply. Requires an IG Business/Creator account linked to a Facebook Page."
          disconnectConfirm={{
            title: "Disconnect Instagram?",
            description:
              "ReelSpy will remove your saved Instagram connection. Your tracked reels stay, but syncing, publishing and auto-reply pause until you reconnect.",
          }}
        >
          {!metaReady ? (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-300">
              Instagram connection isn&apos;t configured on the server yet.
            </p>
          ) : showSetupDetails ? (
            <details className="group rounded-xl border border-border bg-background p-4 text-sm">
              <summary className="cursor-pointer list-none font-medium text-muted-foreground hover:text-foreground">
                Setup details
              </summary>
              <div className="mt-3 space-y-1 text-muted-foreground">
                <p>
                  App ID: <span className="font-mono text-xs">{igAppId ?? "not set"}</span>
                </p>
                <p>
                  Callback URL:{" "}
                  <span className="font-mono text-xs">{process.env.META_REDIRECT_URI ?? "not set"}</span>
                </p>
                <p>
                  Permissions: <span className="font-medium">{scopes}</span>
                </p>
                <p className="pt-1 text-xs text-subtle">
                  Your Instagram must be a Business or Creator account linked to a Facebook Page.
                </p>
              </div>
            </details>
          ) : null}
        </ConnectionCard>

        <ConnectionCard
          platform="facebook"
          icon={ThumbsUp}
          connected={Boolean(profile?.fb_page_id)}
          handle={profile?.fb_page_id ? "Page connected" : null}
          needsReconnect={igNeedsReconnect}
          connectHref="/api/ig/connect"
          disabled={!metaReady}
          note="Posts to your linked Facebook Page (connected together with Instagram)."
        />

        <ConnectionCard
          platform="tiktok"
          icon={Music2}
          connected={Boolean(tiktok)}
          handle={tiktok?.account_username ? `@${tiktok.account_username}` : null}
          needsReconnect={tiktok?.token_status === "invalid"}
          connectHref="/api/social/tiktok/connect"
          disconnectHref="/api/social/tiktok/disconnect"
          note="Posts via the TikTok Content Posting API."
        />

        <ConnectionCard
          platform="youtube"
          icon={PlayCircle}
          connected={Boolean(youtube)}
          handle={youtube?.account_name ?? null}
          needsReconnect={youtube?.token_status === "invalid"}
          connectHref="/api/social/youtube/connect"
          disconnectHref="/api/social/youtube/disconnect"
          note="Uploads via the YouTube Data API and powers comment auto-reply."
        />
      </div>

      <p className="rounded-lg border border-border bg-background px-4 py-3 text-xs text-subtle">
        Note: Instagram &amp; Facebook posting works on your own account with no Meta App Review
        (the app stays in development mode). TikTok and YouTube post to your own account right away
        but stay private until their platform audits pass. See{" "}
        <span className="font-mono">docs/publishing-setup.md</span> for the full step-by-step.
      </p>
    </div>
  );
}
