import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CalendarView } from "@/components/calendar/CalendarView";

type ScheduledScript = {
  id: string;
  hook: string | null;
  status: string | null;
  scheduled_date: string;
  viral_pattern: string | null;
  platform: string | null;
};

export default async function CalendarPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data, error } = await supabase
    .from("generated_scripts")
    .select("id, hook, status, scheduled_date, viral_pattern, platform")
    .eq("user_id", user.id)
    .not("scheduled_date", "is", null)
    .order("scheduled_date", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const scheduled = (data ?? []).filter((s) => s.scheduled_date) as ScheduledScript[];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold text-white">Calendar</h1>
        <p className="text-sm text-zinc-400">
          Scripts scheduled for publishing. Set dates from the Scripts page.
        </p>
      </div>

      <CalendarView scripts={scheduled} />
    </div>
  );
}
