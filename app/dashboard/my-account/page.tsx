import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { GrowthNotes } from "@/components/instagram/GrowthNotes";
import { MyAccountOverview } from "@/components/instagram/MyAccountOverview";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getIgCredentials } from "@/lib/instagram/token-store";
import { getMyInsights } from "@/lib/instagram/graph-api";
import { readMyInsightsCache, type MyInsightsProfile } from "@/lib/instagram/my-insights";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { PageTourButton } from "@/components/tour/PageTourButton";

export default async function MyAccountPage() {
  const { locale } = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  const fullDict = getDictionary(locale);
  const dict = fullDict.myAccount;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();

  // Token reads go through the admin client; browser-facing roles can only see
  // connection metadata, never the token column.
  const admin = createAdminClient();
  const credentials = await getIgCredentials(admin, user.id).catch(() => null);
  const connected = Boolean(credentials);

  let insights: MyInsightsProfile | null = null;
  let igError: string | null = null;

  if (credentials) {
    // The header reads from the same per-user cache as the insights section, so
    // page renders don't block on a Graph call once a first sync has happened.
    const cached = await readMyInsightsCache(admin, user.id).catch(() => null);
    if (cached) {
      insights = cached.payload.profile;
    } else {
      try {
        insights = await getMyInsights(credentials.igUserId, credentials.token);
      } catch {
        igError = dict.igLoadError;
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl sm:text-3xl font-semibold text-foreground">{dict.pageTitle}</h1>
          <PageTourButton page="myAccount" />
        </div>
        <p className="text-sm text-muted-foreground">
          {dict.pageSubtitle}
        </p>
      </div>

      <MyAccountOverview
        initialProfile={insights}
        connected={connected}
        fallbackName={profile?.username ?? user.email ?? "—"}
        igLoadError={igError}
      >
        {/* AI growth notes up top so they're the first thing you see */}
        <GrowthNotes connected={connected} />
      </MyAccountOverview>

      {!connected ? (
        <div className="rounded-xl border border-dashed border-border-strong p-5 text-sm text-muted-foreground">
          {dict.connectPromptPrefix}{" "}
          <Link href="/dashboard/connections" className="text-accent-brand hover:underline">
            {fullDict.nav.connections}
          </Link>{" "}
          {dict.connectPromptSuffix}
        </div>
      ) : null}
    </div>
  );
}
