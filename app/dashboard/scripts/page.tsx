import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScriptGenerator } from "@/components/scripts/ScriptGenerator";
import { ScriptsList } from "@/components/scripts/ScriptsList";
import { deleteScript, updateScriptStatus, scheduleScript } from "./actions";

type GeneratedScriptRow = {
  id: string;
  hook: string | null;
  body: string | null;
  cta: string | null;
  viral_pattern: string | null;
  platform: string | null;
  status: string | null;
  scheduled_date: string | null;
  created_at: string;
};

export default async function ScriptsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data, error } = await supabase
    .from("generated_scripts")
    .select("id, hook, body, cta, viral_pattern, platform, status, scheduled_date, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(error.message);
  }

  const scripts = (data ?? []) as GeneratedScriptRow[];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold text-white">Scripts</h1>
        <p className="text-sm text-zinc-400">Generate and manage your content scripts.</p>
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
