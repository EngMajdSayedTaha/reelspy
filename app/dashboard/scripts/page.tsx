import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScriptGenerator } from "@/components/scripts/ScriptGenerator";
import { ScriptsList, type ScriptRow } from "@/components/scripts/ScriptsList";
import { deleteScript, updateScriptStatus, scheduleScript } from "./actions";

export default async function ScriptsPage() {
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
        <h1 className="text-2xl sm:text-3xl font-semibold text-foreground">Scripts</h1>
        <p className="text-sm text-muted-foreground">
          Generate new scripts and browse everything you&apos;ve created so far.
        </p>
      </div>

      <ScriptGenerator />

      <ScriptsList
        scripts={scripts}
        deleteAction={deleteScript}
        updateStatusAction={updateScriptStatus}
        scheduleAction={scheduleScript}
      />
    </div>
  );
}
