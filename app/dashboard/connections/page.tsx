import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ConnectionCard } from "@/components/publishing/ConnectionCard";
import { WorkspaceSwitcher } from "@/components/connections/WorkspaceSwitcher";
import { BetaTesterGate } from "@/components/connections/BetaTesterGate";
import { listIgConnections } from "@/lib/instagram/connections";
import { getMetaRedirectUri } from "@/lib/instagram/graph-api";
import { resolveUserEntitlements } from "@/lib/billing/resolve";
import { limitOf } from "@/lib/billing/entitlements";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { getDictionary, type Dict } from "@/lib/i18n/dictionaries";
import { PageTourButton } from "@/components/tour/PageTourButton";
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
    state_expired: dict.stateExpired,
    missing_code: dict.missingCode,
    oauth_failed: dict.oauthFailed,
    tiktok_env_missing: dict.tiktokEnvMissing,
    youtube_env_missing: dict.youtubeEnvMissing,
    threads_env_missing: dict.threadsEnvMissing,
    unsupported_platform: dict.unsupportedPlatform,
    meta_env_missing: dict.metaEnvMissing,
    instagram_login_env_missing: dict.instagramLoginEnvMissing,
    ig_login_needs_professional_account: dict.igLoginNeedsProfessionalAccount,
    profile_update_failed: dict.profileUpdateFailed,
    account_link_failed: dict.accountLinkFailed,
    no_ig_business_account: dict.noIgBusinessAccount,
    // Facebook's own code when the user hits Cancel on the consent dialog —
    // passed straight through by the callback (app/api/ig/callback/route.ts),
    // so the raw provider string is the key here, not one we invented.
    access_denied: dict.connectionCancelled,
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
        "ig_user_id, fb_page_id, username, ig_token_status, ig_token_expires_at, ig_token_refreshed_at, ig_auth_flow"
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
  // The redirect URI is no longer a required env — it defaults to the canonical
  // site origin (see getMetaRedirectUri) — so readiness only needs the app
  // credentials, matching what /api/ig/connect actually requires.
  const metaReady = Boolean(igAppId && process.env.META_APP_SECRET);
  const scopes = process.env.META_IG_SCOPES?.trim() || "instagram_business_basic";

  const igConnected = Boolean(profile?.ig_user_id);
  const igExpiresAt = profile?.ig_token_expires_at ?? null;
  const igNeedsReconnect =
    igConnected && (profile?.ig_token_status === "invalid" || isExpired(igExpiresAt));
  const igConnectedDirect = igConnected && profile?.ig_auth_flow === "instagram_login";

  const igDetail = igNeedsReconnect
    ? dict.igExpired
    : igConnectedDirect
      ? dict.connectedViaInstagramDirect
      : igExpiresAt
        ? dict.igRenewsThrough(formatDate(igExpiresAt, bcp47) ?? "")
        : dict.connectionActive;

  // Troubleshooting setup details only surface when there's a reason to look.
  const showSetupDetails = metaReady && (!igConnected || Boolean(errorMessage));

  // Direct Instagram Login (no Facebook Page) — the fix for a creator whose IG
  // Business/Creator account has no linked Page. A separate app/product from
  // the Facebook Login flow above, so it's gated on its own env readiness.
  const igLoginReady = Boolean(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET);
  const showIgLoginCta = igLoginReady && !igConnected;

  // ── TikTok / YouTube (social_connections) ──────────────────────────────────
  const tiktok = conns?.find((c) => c.platform === "tiktok" && c.is_active);
  const youtube = conns?.find((c) => c.platform === "youtube" && c.is_active);
  const threads = conns?.find((c) => c.platform === "threads" && c.is_active);
  // Threads has its OWN app id/secret — adding the Threads use case to a Meta
  // app mints a second pair, and META_APP_ID does not work against
  // graph.threads.net. See docs/publishing-setup.md.
  const threadsReady = Boolean(process.env.THREADS_APP_ID && process.env.THREADS_APP_SECRET);

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

  // Phase 0 (Plan_Reelspy/09-platform-access.md): the Meta app is still in
  // Development mode, so Connect only works for Tester/Developer/Admin roles
  // who accepted the invite. Only worth showing to someone who still needs to
  // connect — a user already connected got past this already.
  const showBetaGate = process.env.META_BETA_MODE === "true" && !igConnected;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl sm:text-3xl font-semibold text-foreground">{fullDict.titles.connections}</h1>
          <PageTourButton page="connections" />
        </div>
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
        <div data-tour="workspace-switcher">
          <WorkspaceSwitcher
            connections={igConnections}
            activeId={activeConnectionId}
            connectionCap={connectionCap}
          />
        </div>
      ) : null}

      <div className="grid gap-4">
        {showBetaGate ? <BetaTesterGate dict={dict.betaGate} /> : null}

        {/* Instagram + Facebook share the Meta OAuth flow. */}
        <div data-tour="ig-connection">
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
          {!metaReady || showSetupDetails || showIgLoginCta || igConnectedDirect ? (
          <div className="space-y-3">
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
                    <span className="font-mono text-xs">{getMetaRedirectUri()}</span>
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

            {/* No Facebook Page? Direct Instagram Login skips Facebook entirely —
                separate product/app from the Facebook Login flow above. */}
            {showIgLoginCta ? (
              <div className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <a href="/api/ig/login/connect" className="font-medium text-brand hover:underline">
                  {dict.igLoginCta}
                </a>
                <p className="mt-1 text-xs text-muted-foreground">{dict.igLoginNote}</p>
              </div>
            ) : null}

            {igConnectedDirect ? (
              <p className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                {dict.igLoginUpgradeNote}
              </p>
            ) : null}
          </div>
          ) : null}
        </ConnectionCard>
        </div>

        <ConnectionCard
          platform="facebook"
          connected={Boolean(profile?.fb_page_id)}
          handle={profile?.fb_page_id ? dict.pageConnected : null}
          needsReconnect={igNeedsReconnect}
          connectHref="/api/ig/connect"
          disabled={!metaReady}
          note={dict.fbNote}
        />

        <div data-tour="tiktok-connection">
        <ConnectionCard
          platform="tiktok"
          connected={Boolean(tiktok)}
          handle={tiktok?.account_username ? `@${tiktok.account_username}` : null}
          needsReconnect={tiktok?.token_status === "invalid"}
          connectHref="/api/social/tiktok/connect"
          disconnectHref="/api/social/tiktok/disconnect"
          note={dict.tiktokNote}
        />
        </div>

        <div data-tour="youtube-connection">
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

        <div data-tour="threads-connection">
        <ConnectionCard
          platform="threads"
          connected={Boolean(threads)}
          handle={threads?.account_username ? `@${threads.account_username}` : null}
          needsReconnect={threads?.token_status === "invalid"}
          connectHref="/api/social/threads/connect"
          disconnectHref="/api/social/threads/disconnect"
          disabled={!threadsReady}
          note={threadsReady ? dict.threadsNote : dict.threadsEnvMissing}
        />
        </div>
      </div>

      <p className="rounded-lg border border-border bg-background px-4 py-3 text-xs text-subtle">
        {dict.footerNoteBeforeDocs}{" "}
        <span className="font-mono">docs/publishing-setup.md</span> {dict.footerNoteAfterDocs}
      </p>
    </div>
  );
}
