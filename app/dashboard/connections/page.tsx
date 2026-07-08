import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ConnectionCard } from "@/components/publishing/ConnectionCard";
import { WorkspaceSwitcher } from "@/components/connections/WorkspaceSwitcher";
import { listIgConnections } from "@/lib/instagram/connections";
import { resolveUserEntitlements } from "@/lib/billing/resolve";
import { limitOf } from "@/lib/billing/entitlements";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { getDictionary, type Dict } from "@/lib/i18n/dictionaries";
import { intlLocale } from "@/lib/i18n/intl";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

// Merged from the old per-platform pages so every OAuth round-trip lands here.
function errorMap(dict: Dict["connections"]): Record<string, string> {
  return {
    invalid_state: dict.invalidState,
    missing_code: dict.missingCode,
    oauth_failed: dict.oauthFailed,
    tiktok_env_missing: dict.tiktokEnvMissing,
    youtube_env_missing: dict.youtubeEnvMissing,
    unsupported_platform: dict.unsupportedPlatform,
    meta_env_missing: dict.metaEnvMissing,
    profile_update_failed: dict.profileUpdateFailed,
    account_link_failed: dict.accountLinkFailed,
    no_ig_business_account: dict.noIgBusinessAccount,
  };
}

function isExpired(value: string | null | undefined): boolean {
  return value ? new Date(value).getTime() <= Date.now() : false;
}

function formatDate(value: string | null | undefined, locale: string): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(value: string | null | undefined, locale: string): string | null {
  if (!value) return null;
  return new Date(value).toLocaleString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function ConnectionsPage({ searchParams }: PageProps) {
  const { locale } = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  const fullDict = getDictionary(locale);
  const dict = fullDict.connections;
  const bcp47 = intlLocale(locale);
  const params = await searchParams;
  const error = firstParam(params.error);
  const success = firstParam(params.success);
  const detail = firstParam(params.detail);
  const errorMessage = error ? errorMap(dict)[error] ?? dict.genericError : null;

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
    ? dict.igExpired
    : igExpiresAt
      ? dict.igRenewsThrough(formatDate(igExpiresAt, bcp47) ?? "")
      : dict.connectionActive;

  // Troubleshooting setup details only surface when there's a reason to look.
  const showSetupDetails = metaReady && (!igConnected || Boolean(errorMessage));

  // ── TikTok / YouTube (social_connections) ──────────────────────────────────
  const tiktok = conns?.find((c) => c.platform === "tiktok" && c.is_active);
  const youtube = conns?.find((c) => c.platform === "youtube" && c.is_active);

  // ── Studio multi-account workspaces (X4) ───────────────────────────────────
  // Fail-open: listIgConnections returns [] when the table isn't there yet, so
  // the switcher simply doesn't render pre-migration. activeId comes from the
  // per-row flag (avoids selecting profiles.active_ig_connection_id, which
  // wouldn't exist before the migration and would error the page query).
  const admin = createAdminClient();
  const [igConnections, { entitlements }] = await Promise.all([
    listIgConnections(admin, user.id),
    resolveUserEntitlements(supabase, user.id),
  ]);
  const connectionCap = limitOf(entitlements, "ig_connections");
  const activeConnectionId = igConnections.find((c) => c.isActive)?.id ?? null;
  // Show once multi-account is relevant: the plan allows more than one, or the
  // user already has more than one connected.
  const showWorkspaces = igConnections.length > 0 && (connectionCap > 1 || igConnections.length > 1);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-semibold text-foreground">{fullDict.titles.connections}</h1>
        <p className="text-sm text-muted-foreground">
          {dict.subtitle}
        </p>
      </div>

      {success === "connected" ? (
        <div className="flex items-center gap-2 rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">
          <CheckCircle2 className="h-4 w-4" /> {dict.connectedSuccess}
        </div>
      ) : null}
      {success === "disconnected" ? (
        <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          <AlertTriangle className="h-4 w-4" /> {dict.disconnectedSuccess}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="space-y-2 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> {errorMessage}
          </div>
          {detail ? (
            <p className="rounded-md border border-danger/20 bg-danger/5 p-2 font-mono text-xs text-danger/80">
              {detail}
            </p>
          ) : null}
        </div>
      ) : null}

      {showWorkspaces ? (
        <WorkspaceSwitcher
          connections={igConnections}
          activeId={activeConnectionId}
          connectionCap={connectionCap}
        />
      ) : null}

      <div className="grid gap-4">
        {/* Instagram + Facebook share the Meta OAuth flow. */}
        <ConnectionCard
          platform="instagram"
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
                  {dict.lastRenewal(formatDateTime(profile.ig_token_refreshed_at, bcp47) ?? "")}
                </span>
              ) : null}
            </>
          }
          note={dict.igNote}
          disconnectConfirm={{
            title: dict.disconnectInstagramTitle,
            description: dict.disconnectInstagramDescription,
          }}
        >
          {!metaReady ? (
            <p className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning">
              {dict.igNotConfigured}
            </p>
          ) : showSetupDetails ? (
            <details className="group rounded-xl border border-border bg-background p-4 text-sm">
              <summary className="cursor-pointer list-none font-medium text-muted-foreground hover:text-foreground">
                {dict.setupDetails}
              </summary>
              <div className="mt-3 space-y-1 text-muted-foreground">
                <p>
                  {dict.appIdLabel} <span className="font-mono text-xs">{igAppId ?? dict.notSet}</span>
                </p>
                <p>
                  {dict.callbackUrlLabel}{" "}
                  <span className="font-mono text-xs">{process.env.META_REDIRECT_URI ?? dict.notSet}</span>
                </p>
                <p>
                  {dict.permissionsLabel} <span className="font-medium">{scopes}</span>
                </p>
                <p className="pt-1 text-xs text-subtle">
                  {dict.igBusinessRequirement}
                </p>
              </div>
            </details>
          ) : null}
        </ConnectionCard>

        <ConnectionCard
          platform="facebook"
          connected={Boolean(profile?.fb_page_id)}
          handle={profile?.fb_page_id ? dict.pageConnected : null}
          needsReconnect={igNeedsReconnect}
          connectHref="/api/ig/connect"
          disabled={!metaReady}
          note={dict.fbNote}
        />

        <ConnectionCard
          platform="tiktok"
          connected={Boolean(tiktok)}
          handle={tiktok?.account_username ? `@${tiktok.account_username}` : null}
          needsReconnect={tiktok?.token_status === "invalid"}
          connectHref="/api/social/tiktok/connect"
          disconnectHref="/api/social/tiktok/disconnect"
          note={dict.tiktokNote}
        />

        <ConnectionCard
          platform="youtube"
          connected={Boolean(youtube)}
          handle={youtube?.account_name ?? null}
          needsReconnect={youtube?.token_status === "invalid"}
          connectHref="/api/social/youtube/connect"
          disconnectHref="/api/social/youtube/disconnect"
          note={dict.youtubeNote}
        />
      </div>

      <p className="rounded-lg border border-border bg-background px-4 py-3 text-xs text-subtle">
        {dict.footerNoteBeforeDocs}{" "}
        <span className="font-mono">docs/publishing-setup.md</span> {dict.footerNoteAfterDocs}
      </p>
    </div>
  );
}
