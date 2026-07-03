import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Plug } from "lucide-react";
import { PreferencesForm } from "@/components/settings/PreferencesForm";
import { DangerZone } from "@/components/settings/DangerZone";
import { createClient } from "@/lib/supabase/server";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { savePreferences } from "./actions";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const prefs = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Tune how the app behaves for you.</p>
      </div>

      <PreferencesForm initial={prefs} action={savePreferences} />

      {/* Connecting/managing social accounts now lives in one place. */}
      <Link
        href="/dashboard/connections"
        className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5 transition hover:border-border-strong"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary ring-1 ring-border-strong">
            <Plug className="h-5 w-5 text-brand" />
          </span>
          <div>
            <p className="font-semibold text-foreground">Social connections</p>
            <p className="text-xs text-muted-foreground">
              Connect & manage Instagram, Facebook, TikTok and YouTube.
            </p>
          </div>
        </div>
        <span className="text-sm font-medium text-brand">Manage →</span>
      </Link>

      <DangerZone />
    </div>
  );
}
