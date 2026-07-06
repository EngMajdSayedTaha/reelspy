import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Radar } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listNiches, nicheTrending, ALL_NICHES } from "@/lib/trends/niche";
import { NichePicker } from "@/components/trends/NichePicker";
import { TrendReelCard } from "@/components/trends/TrendReelCard";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { getDictionary } from "@/lib/i18n/dictionaries";

// Niche Radar (roadmap X3 — the moat). Cross-user aggregate intelligence: what
// over-performs across the WHOLE userbase's tracked accounts, per niche,
// size-controlled so small niche accounts surface above big ones. Anonymized —
// only public accounts + public metrics, never who tracks what.
export default async function TrendsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  const dict = getDictionary(locale).trends;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const nicheParam = typeof sp.niche === "string" ? sp.niche : ALL_NICHES;

  const admin = createAdminClient();
  const [niches, reels, tracked] = await Promise.all([
    listNiches(admin),
    nicheTrending(admin, { niche: nicheParam }),
    supabase.from("inspiration_accounts").select("ig_username").eq("user_id", user.id),
  ]);

  const selected = nicheParam === ALL_NICHES || niches.some((n) => n.niche === nicheParam)
    ? nicheParam
    : ALL_NICHES;
  const trackedSet = new Set(
    (tracked.data ?? []).map((r) => (r.ig_username as string).toLowerCase())
  );
  const activeNiche = selected === ALL_NICHES ? undefined : selected;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <Radar className="h-5 w-5 text-brand" />
          <h1 className="text-xl font-semibold text-foreground">{dict.page.title}</h1>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {dict.page.subtitle}
        </p>
      </header>

      <NichePicker niches={niches} selected={selected} />

      {reels.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-sm font-medium text-foreground">{dict.page.emptyTitle}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {dict.page.emptyDesc}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {reels.map((reel) => (
            <TrendReelCard
              key={`${reel.igUsername}:${reel.permalink ?? reel.postedAt}`}
              reel={reel}
              niche={activeNiche}
              alreadyTracked={trackedSet.has(reel.igUsername.toLowerCase())}
            />
          ))}
        </div>
      )}
    </div>
  );
}
