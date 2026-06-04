import { redirect } from "next/navigation";
import { ScriptGenerator } from "@/components/scripts/ScriptGenerator";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{ reel_id: string }>;
};

export default async function GenerateScriptPage({ params }: PageProps) {
  const { reel_id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: reel, error } = await supabase
    .from("tracked_reels")
    .select("id, caption, ig_permalink")
    .eq("id", reel_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!reel) {
    redirect("/dashboard/feed");
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold text-white">Generate Script</h1>
        <p className="text-sm text-zinc-400">Create an original script from this reel inspiration.</p>
      </div>

      <div className="rounded-xl border border-[#1f1f1f] bg-[#111111] p-4 text-sm text-zinc-300">
        <p className="text-zinc-400">Source Reel</p>
        <a
          href={reel.ig_permalink}
          target="_blank"
          rel="noreferrer"
          className="text-[#F9E400] underline-offset-4 hover:underline"
        >
          Open original post
        </a>
      </div>

      <ScriptGenerator reelId={reel.id} initialCaption={reel.caption ?? ""} />
    </div>
  );
}
