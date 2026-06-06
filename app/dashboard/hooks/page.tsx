import { redirect } from "next/navigation";
import { HooksExplorer } from "@/components/hooks/HooksExplorer";
import { extractHook } from "@/lib/utils/hook";
import { createClient } from "@/lib/supabase/server";

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

export type HookItem = {
  reelId: string;
  hook: string;
  username: string;
  permalink: string;
  viralScore: number | null;
};

function usernameOf(row: ReelRow): string {
  const acc = Array.isArray(row.inspiration_accounts)
    ? row.inspiration_accounts[0]
    : row.inspiration_accounts;
  return acc?.ig_username ?? "unknown";
}

export default async function HooksPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data, error } = await supabase
    .from("tracked_reels")
    .select("id, transcript, caption, ig_permalink, viral_score, inspiration_accounts(ig_username)")
    .eq("user_id", user.id)
    .eq("transcript_status", "ready")
    .not("transcript", "is", null)
    .order("viral_score", { ascending: false, nullsFirst: false })
    .limit(300);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as ReelRow[];

  const hooks: HookItem[] = rows
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
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold text-white">Hook Library</h1>
        <p className="text-sm text-zinc-400">
          The opening lines of every reel you&apos;ve transcribed — search, steal the structure, remix.
        </p>
      </div>

      {hooks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-700 bg-[#101010] p-5 text-sm text-zinc-400">
          No hooks yet. Generate transcripts for some reels (open a reel → Generate transcript) and
          their opening lines will appear here.
        </div>
      ) : (
        <HooksExplorer hooks={hooks} />
      )}
    </div>
  );
}
