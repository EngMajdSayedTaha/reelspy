import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { GrowthNotes } from "@/components/instagram/GrowthNotes";
import { InsightsPanel } from "@/components/instagram/InsightsPanel";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

const errorMessageMap: Record<string, string> = {
  missing_code: "Meta did not return an authorization code.",
  invalid_state: "Instagram OAuth state validation failed. Please retry the connection.",
  meta_env_missing: "Meta app environment values are incomplete.",
  oauth_failed: "Instagram token exchange failed. Check your Meta app settings and retry.",
  profile_update_failed: "Instagram connected, but ReelSpy could not save the token to your profile.",
  account_link_failed: "Instagram connected, but ReelSpy could not link the connected account record.",
  no_ig_business_account:
    "No Instagram Business account found on your Facebook Pages. Make sure your IG account is Business/Creator and linked to a Facebook Page, then reconnect.",
};

export default async function InstagramSettingsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const error = firstParam(params.error);
  const success = firstParam(params.success);
  const detail = firstParam(params.detail);
  const errorMessage = error ? errorMessageMap[error] ?? error : null;

  const appId = process.env.META_APP_ID;
  const igAppId = process.env.META_IG_APP_ID || appId;
  const appSecret = process.env.META_APP_SECRET;
  const redirectUri = process.env.META_REDIRECT_URI;
  const scopes = process.env.META_IG_SCOPES?.trim() || "instagram_business_basic";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("ig_user_id, ig_access_token")
    .eq("id", user.id)
    .maybeSingle();

  const isConnected = Boolean(profile?.ig_user_id && profile?.ig_access_token);
  const oauthReady = Boolean(igAppId && appSecret && redirectUri);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold text-white">Instagram Settings</h1>
        <p className="text-sm text-zinc-400">
          Connect Instagram, then sync recent reels into your tracking feed.
        </p>
      </div>

      <div className="rounded-xl border border-[#1f1f1f] bg-[#111111] p-5 text-zinc-100">
        <p className="text-sm text-zinc-300">
          Connection status: <span className="font-semibold text-white">{isConnected ? "Connected" : "Not connected"}</span>
        </p>

        {success === "connected" ? (
          <p className="mt-3 text-sm text-emerald-400">Instagram connected successfully.</p>
        ) : null}

        {success === "disconnected" ? (
          <p className="mt-3 text-sm text-amber-400">Instagram disconnected. You can reconnect below.</p>
        ) : null}

        {errorMessage ? (
          <div className="mt-3 space-y-1">
            <p className="text-sm text-rose-400">Instagram error: {errorMessage}</p>
            {detail ? (
              <p className="rounded-md border border-rose-500/30 bg-rose-500/5 p-2 font-mono text-xs text-rose-300">
                {detail}
              </p>
            ) : null}
          </div>
        ) : null}

        {!oauthReady ? (
          <p className="mt-3 text-sm text-amber-400">
            Set META_APP_ID (or META_IG_APP_ID), META_APP_SECRET, and META_REDIRECT_URI in your environment to enable OAuth connect.
          </p>
        ) : null}

        <div className="mt-3 rounded-md border border-zinc-800 bg-[#0c0c0c] p-3 text-sm text-zinc-300">
          <p>OAuth App ID used for Instagram: <span className="font-mono text-xs">{igAppId ?? "META_APP_ID / META_IG_APP_ID not set"}</span></p>
          <p>Required callback URI in Meta App: <span className="font-mono text-xs">{redirectUri ?? "META_REDIRECT_URI not set"}</span></p>
          <p className="mt-1">Required permissions: <span className="font-medium">{scopes}</span></p>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          {oauthReady ? (
            <Button asChild>
              <a href="/api/ig/connect">{isConnected ? "Reconnect Instagram" : "Connect Instagram"}</a>
            </Button>
          ) : (
            <Button disabled>Connect Instagram</Button>
          )}

          {isConnected ? (
            <Button asChild variant="outline">
              <a href="/api/ig/disconnect">Disconnect</a>
            </Button>
          ) : null}
        </div>
      </div>

      <InsightsPanel connected={isConnected} />
      <GrowthNotes connected={isConnected} />
    </div>
  );
}
