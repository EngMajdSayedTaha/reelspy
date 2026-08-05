import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ReleaseCard } from "@/components/release/ReleaseCard";
import { RELEASES } from "@/lib/release/releases";
import { CURRENT_VERSION } from "@/lib/release/version";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { getDictionary } from "@/lib/i18n/dictionaries";

export const metadata: Metadata = {
  title: "What's new",
};

// The full product history, newest first. Static data — no auth check beyond
// the dashboard layout's, no database read, nothing to fail.
export default async function WhatsNewPage() {
  const { locale } = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  const t = getDictionary(locale).release;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">{t.heading}</h1>
          <span className="rounded-full bg-secondary px-2.5 py-0.5 font-mono text-xs font-medium text-muted-foreground">
            {t.versionShort(CURRENT_VERSION)}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{t.subheading}</p>
      </div>

      {RELEASES.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border-strong bg-card p-6 text-sm text-muted-foreground">
          {t.empty}
        </p>
      ) : (
        <div className="space-y-4">
          {RELEASES.map((release) => (
            <ReleaseCard
              key={release.version}
              release={release}
              isCurrent={release.version === CURRENT_VERSION}
            />
          ))}
        </div>
      )}
    </div>
  );
}
