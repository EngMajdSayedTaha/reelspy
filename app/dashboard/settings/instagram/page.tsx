import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CheckCircle2, AlertTriangle, AtSign, Link2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DisconnectButton } from "@/components/instagram/DisconnectButton";
import { PreferencesForm } from "@/components/settings/PreferencesForm";
import { createClient } from "@/lib/supabase/server";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { savePreferences } from "../actions";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

const errorMessageMap: Record<string, string> = {
  missing_code: "Meta did not return an authorization code.",
  invalid_state: "Instagram sign-in could not be verified. Please try connecting again.",
  meta_env_missing: "Instagram connection isn't configured yet. Contact support.",
  oauth_failed: "Instagram sign-in failed. Please try connecting again.",
  profile_update_failed: "Connected, but we couldn't save your connection. Please retry.",
  account_link_failed: "Connected, but we couldn't link your account. Please retry.",
  no_ig_business_account:
    "No Instagram Business account was found. Make sure your Instagram is a Business or Creator account linked to a Facebook Page, then reconnect.",
};

// Helper (not called inline in the component body) so the date math doesn't trip
// the render-purity lint, matching how the feed page handles "now".
function isExpired(value: string | null | undefined): boolean {
  return value ? new Date(value).getTime() <= Date.now() : false;
}

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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

export default async function InstagramSettingsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const error = firstParam(params.error);
  const success = firstParam(params.success);
  const detail = firstParam(params.detail);
  const errorMessage = error ? errorMessageMap[error] ?? "Something went wrong. Please try again." : null;

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

  // Connection metadata only — the token column is not readable by browser-
  // facing roles, and ig_user_id is set/cleared in lockstep with it.
  const { data: profile } = await supabase
    .from("profiles")
    .select("ig_user_id, ig_token_status, ig_token_expires_at, ig_token_refreshed_at, username")
    .eq("id", user.id)
    .maybeSingle();

  const prefs = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);

  const isConnected = Boolean(profile?.ig_user_id);
  const oauthReady = Boolean(igAppId && appSecret && redirectUri);

  const expiresAt = profile?.ig_token_expires_at ?? null;
  const isExpiredByDate = isExpired(expiresAt);
  const tokenStatus = profile?.ig_token_status ?? "active";
  const needsReconnect =
    isConnected && (tokenStatus === "invalid" || tokenStatus === "expired" || isExpiredByDate);

  // Setup details are a troubleshooting aid — only surface them when something
  // needs attention (not connected, or an error occurred), never in the happy path.
  const showSetupDetails = !isConnected || Boolean(errorMessage);

  const statusBadge = !isConnected
    ? { label: "Not connected", className: "border-zinc-700 bg-zinc-800/50 text-zinc-300" }
    : needsReconnect
      ? { label: "Reconnect needed", className: "border-rose-500/40 bg-rose-500/10 text-rose-300" }
      : { label: "Connected", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" };

  const username = profile?.username ?? null;

  // Google OAuth stores the photo in user_metadata (avatar_url or picture);
  // email/password accounts have neither and keep the icon fallback.
  const avatarUrl =
    (user.user_metadata?.avatar_url as string | undefined) ??
    (user.user_metadata?.picture as string | undefined) ??
    null;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-semibold text-white">Instagram</h1>
        <p className="text-sm text-zinc-400">
          Connect your Instagram to sync reels from the accounts you track.
        </p>
      </div>

      {/* Transient result messages from the OAuth round-trip */}
      {success === "connected" ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          <CheckCircle2 className="h-4 w-4" /> Instagram connected successfully.
        </div>
      ) : null}
      {success === "disconnected" ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          <AlertTriangle className="h-4 w-4" /> Instagram disconnected. You can reconnect below.
        </div>
      ) : null}
      {errorMessage ? (
        <div className="space-y-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
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

      {/* Connection card */}
      <div className="rounded-2xl border border-[#1f1f1f] bg-[#111111] p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt="Your profile photo"
                referrerPolicy="no-referrer"
                className="h-12 w-12 shrink-0 rounded-full object-cover ring-1 ring-[#2e2e2e]"
              />
            ) : (
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#F9E400]/20 to-[#1a1a1a] ring-1 ring-[#2e2e2e]">
                <AtSign className="h-6 w-6 text-[#F9E400]" />
              </span>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-white">
                  {isConnected && username ? `@${username}` : "Instagram account"}
                </p>
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadge.className}`}
                >
                  {statusBadge.label}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-zinc-500">
                {needsReconnect
                  ? "Your connection expired — reconnect to resume syncing."
                  : isConnected
                    ? expiresAt
                      ? `Renews automatically · valid through ${formatDate(expiresAt)}`
                      : "Connection active."
                    : "Not connected yet."}
              </p>
              {isConnected && profile?.ig_token_refreshed_at ? (
                <p className="mt-0.5 text-xs text-zinc-500">
                  Last reconnect / token renewal:{" "}
                  <span className="text-zinc-300">
                    {formatDateTime(profile.ig_token_refreshed_at)}
                  </span>
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {oauthReady ? (
              <Button asChild variant={needsReconnect || !isConnected ? "default" : "outline"}>
                <a href="/api/ig/connect">
                  {isConnected ? (
                    <>
                      <RefreshCw className="h-4 w-4" /> Reconnect
                    </>
                  ) : (
                    <>
                      <Link2 className="h-4 w-4" /> Connect Instagram
                    </>
                  )}
                </a>
              </Button>
            ) : (
              <Button disabled>
                <Link2 className="h-4 w-4" /> Connect Instagram
              </Button>
            )}

            {isConnected ? <DisconnectButton /> : null}
          </div>
        </div>

        {!oauthReady ? (
          <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-300">
            Instagram connection isn&apos;t configured on the server yet.
          </p>
        ) : null}
      </div>

      {/* Troubleshooting details — only when not connected or on error */}
      {showSetupDetails && oauthReady ? (
        <details className="group rounded-2xl border border-[#1f1f1f] bg-[#0f0f0f] p-4 text-sm">
          <summary className="cursor-pointer list-none font-medium text-zinc-300 hover:text-white">
            Setup details
          </summary>
          <div className="mt-3 space-y-1 text-zinc-400">
            <p>
              App ID: <span className="font-mono text-xs text-zinc-300">{igAppId ?? "not set"}</span>
            </p>
            <p>
              Callback URL:{" "}
              <span className="font-mono text-xs text-zinc-300">{redirectUri ?? "not set"}</span>
            </p>
            <p>
              Permissions: <span className="font-medium text-zinc-300">{scopes}</span>
            </p>
            <p className="pt-1 text-xs text-zinc-500">
              Your Instagram must be a Business or Creator account linked to a Facebook Page.
            </p>
          </div>
        </details>
      ) : null}

      <PreferencesForm initial={prefs} action={savePreferences} />
    </div>
  );
}
