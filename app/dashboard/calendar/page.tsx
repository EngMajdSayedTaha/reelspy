import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  CalendarView,
  type CalendarScript,
  type CalendarPost,
} from "@/components/calendar/CalendarView";
import type { Platform } from "@/lib/publishing/types";
import { scheduleScript, unscheduleScript } from "../scripts/actions";
import { reschedulePost } from "../publishing/actions";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { getDictionary } from "@/lib/i18n/dictionaries";

type PublishPostRow = {
  id: string;
  title: string | null;
  caption: string | null;
  status: string;
  scheduled_at: string | null;
  publish_jobs: { platform: Platform }[];
};

export default async function CalendarPage() {
  const { locale } = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  const dict = getDictionary(locale).calendar;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Two sources feed the calendar:
  //  • generated_scripts — draggable, scheduled by date (the planning layer).
  //  • publish_posts with a scheduled_at — real cross-posts queued from the
  //    Publishing tab, shown read-only so you can see what actually goes live.
  const [scriptsRes, postsRes] = await Promise.all([
    supabase
      .from("generated_scripts")
      .select("id, hook, status, scheduled_date, platform, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("publish_posts")
      .select("id, title, caption, status, scheduled_at, publish_jobs(platform)")
      .eq("user_id", user.id)
      .not("scheduled_at", "is", null)
      .order("scheduled_at", { ascending: true })
      .returns<PublishPostRow[]>(),
  ]);

  if (scriptsRes.error) {
    throw new Error(scriptsRes.error.message);
  }

  const scripts = (scriptsRes.data ?? []) as CalendarScript[];
  const posts: CalendarPost[] = (postsRes.data ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    caption: p.caption,
    status: p.status,
    scheduled_at: p.scheduled_at,
    platforms: p.publish_jobs.map((j) => j.platform),
  }));

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-semibold text-foreground">{dict.pageTitle}</h1>
        <p className="text-sm text-muted-foreground">
          {dict.subtitle}
        </p>
      </div>

      <CalendarView
        scripts={scripts}
        posts={posts}
        scheduleAction={scheduleScript}
        unscheduleAction={unscheduleScript}
        reschedulePostAction={reschedulePost}
      />
    </div>
  );
}
