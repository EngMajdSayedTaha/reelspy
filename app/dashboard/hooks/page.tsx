import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { HooksExplorer } from "@/components/hooks/HooksExplorer";
import { SavedHooksLibrary, type SavedHook } from "@/components/hooks/SavedHooksLibrary";
import { extractHook } from "@/lib/utils/hook";
import { createClient } from "@/lib/supabase/server";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { PageTourButton } from "@/components/tour/PageTourButton";

type ReelRow = {
  id: string;
  transcript: string | null;
  caption: string | null;
  ig_permalink: string;
  viral_score: number | null;
  inspiration_accounts:
    | { ig_username: string }
    | { ig_username: string }[]
    | null;
};

type SavedHookRow = {
  id: string;
  text: string;
  tags: string[] | null;
  reel_id: string | null;
  tracked_reels:
    | { ig_permalink: string | null; inspiration_accounts: { ig_username: string } | { ig_username: string }[] | null }
    | { ig_permalink: string | null; inspiration_accounts: { ig_username: string } | { ig_username: string }[] | null }[]
    | null;
};

export type HookItem = {
  reelId: string;
  hook: string;
  username: string;
  permalink: string;
  viralScore: number | null;
};

function firstOf<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function usernameOf(row: ReelRow): string {
  return firstOf(row.inspiration_accounts)?.ig_username ?? "unknown";
}

export default async function HooksPage() {
  const { locale } = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  const dict = getDictionary(locale).hooks;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [reelsRes, savedRes] = await Promise.all([
    supabase
      .from("tracked_reels")
      .select("id, transcript, caption, ig_permalink, viral_score, inspiration_accounts(ig_username)")
      .eq("user_id", user.id)
      .eq("transcript_status", "ready")
      .not("transcript", "is", null)
      .order("viral_score", { ascending: false, nullsFirst: false })
      .limit(300),
    supabase
      .from("saved_hooks")
      .select("id, text, tags, reel_id, tracked_reels(ig_permalink, inspiration_accounts(ig_username))")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  if (reelsRes.error) throw new Error(reelsRes.error.message);
  if (savedRes.error) throw new Error(savedRes.error.message);

  const savedHooks: SavedHook[] = ((savedRes.data ?? []) as SavedHookRow[]).map((row) => {
    const reel = firstOf(row.tracked_reels);
    return {
      id: row.id,
      text: row.text,
      tags: row.tags ?? [],
      reelId: row.reel_id,
      permalink: reel?.ig_permalink ?? null,
      username: firstOf(reel?.inspiration_accounts)?.ig_username ?? null,
    };
  });
  const savedTexts = savedHooks.map((h) => h.text);

  const suggestions: HookItem[] = ((reelsRes.data ?? []) as ReelRow[])
    .map((row) => {
      const hook = extractHook(row.transcript);
      if (!hook) return null;
      return {
        reelId: row.id,
        hook,
        username: usernameOf(row),
        permalink: row.ig_permalink,
        viralScore: row.viral_score,
      } satisfies HookItem;
    })
    .filter((item): item is HookItem => item !== null);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl sm:text-3xl font-semibold text-foreground">{dict.page.title}</h1>
          <PageTourButton page="hooks" />
        </div>
        <p className="text-sm text-muted-foreground">
          {dict.page.subtitle}
        </p>
      </div>

      <section data-tour="saved-hooks" className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">{dict.page.savedHeading}</h2>
        <SavedHooksLibrary hooks={savedHooks} />
      </section>

      {suggestions.length > 0 ? (
        <section data-tour="hook-suggestions" className="space-y-3">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">{dict.page.fromTranscriptsHeading}</h2>
            <p className="text-sm text-muted-foreground">
              {dict.page.fromTranscriptsSubtitle}
            </p>
          </div>
          <HooksExplorer hooks={suggestions} savedTexts={savedTexts} />
        </section>
      ) : null}
    </div>
  );
}
