import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Plug, ArrowRight } from "lucide-react";
import { PreferencesForm } from "@/components/settings/PreferencesForm";
import { ThemePicker } from "@/components/settings/ThemePicker";
import { DigestToggle } from "@/components/settings/DigestToggle";
import { QuizSettingsSection } from "@/components/settings/QuizSettingsSection";
import { DangerZone } from "@/components/settings/DangerZone";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getQuizNicheChips } from "@/lib/onboarding/niche-chips";
import type { BrandVoice } from "@/lib/ai/brand-voice";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { PageTourButton } from "@/components/tour/PageTourButton";
import { savePreferences } from "./actions";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const prefs = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  const dict = getDictionary(prefs.locale);
  const t = dict.settings;

  const [{ data: profile }, quizNicheChips] = await Promise.all([
    supabase
      .from("profiles")
      .select("digest_opt_out, brand_voice, color_theme")
      .eq("id", user.id)
      .maybeSingle(),
    getQuizNicheChips(createAdminClient()),
  ]);
  const brandVoice = (profile?.brand_voice as BrandVoice | null) ?? null;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl sm:text-3xl font-semibold text-foreground">{t.heading}</h1>
          <PageTourButton page="settings" />
        </div>
        <p className="text-sm text-muted-foreground">{t.subheading}</p>
      </div>

      <div data-tour="preferences-form">
        <PreferencesForm initial={prefs} action={savePreferences} />
      </div>

      <div data-tour="theme-picker">
        <ThemePicker initialTheme={(profile?.color_theme as string | null) ?? null} />
      </div>

      <div data-tour="digest-toggle">
        <DigestToggle initialOptOut={Boolean(profile?.digest_opt_out)} />
      </div>

      <div data-tour="brand-voice">
        <QuizSettingsSection brandVoice={brandVoice} nicheChips={quizNicheChips} />
      </div>

      {/* Connecting/managing social accounts now lives in one place. */}
      <Link
        href="/dashboard/connections"
        data-tour="connections-shortcut"
        className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5 transition hover:border-border-strong"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary ring-1 ring-border-strong">
            <Plug className="h-5 w-5 text-brand" />
          </span>
          <div>
            <p className="font-semibold text-foreground">{t.socialConnections.title}</p>
            <p className="text-xs text-muted-foreground">{t.socialConnections.description}</p>
          </div>
        </div>
        <span className="flex items-center gap-1 text-sm font-medium text-brand">
          {t.socialConnections.manage}
          <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
        </span>
      </Link>

      <div data-tour="danger-zone">
        <DangerZone />
      </div>
    </div>
  );
}
