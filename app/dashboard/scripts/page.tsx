import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ScriptGenerator } from "@/components/scripts/ScriptGenerator";
import { ScriptsList, type ScriptRow } from "@/components/scripts/ScriptsList";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { PageTourButton } from "@/components/tour/PageTourButton";
import { deleteScript, updateScriptStatus, scheduleScript } from "./actions";

type ScriptsPageProps = {
  searchParams: Promise<{ hook?: string }>;
};

export default async function ScriptsPage({ searchParams }: ScriptsPageProps) {
  const { hook } = await searchParams;
  const { locale } = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  const dict = getDictionary(locale);

  // A saved hook arrives via ?hook= from the Hook Library "Use in script" action.
  // Frame it as guidance so the generator opens with it. Cap defensively.
  const initialContext = hook ? dict.scripts.openWithHook(hook.slice(0, 400)) : "";

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // History of everything generated, newest first, with the source reel joined
  // in so each script can show where the idea came from.
  const { data, error } = await supabase
    .from("generated_scripts")
    .select(
      "id, hook, body, cta, platform, status, scheduled_date, created_at, tracked_reels(id, thumbnail_url, ig_permalink, inspiration_accounts(ig_username, avatar_url))"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(error.message);
  }

  const scripts = (data ?? []) as unknown as ScriptRow[];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl sm:text-3xl font-semibold text-foreground">{dict.scripts.pageTitle}</h1>
          <PageTourButton page="scripts" />
        </div>
        <p className="text-sm text-muted-foreground">{dict.scripts.pageSubtitle}</p>
      </div>

      <ScriptGenerator initialContext={initialContext} />

      <ScriptsList
        scripts={scripts}
        deleteAction={deleteScript}
        updateStatusAction={updateScriptStatus}
        scheduleAction={scheduleScript}
      />
    </div>
  );
}
