import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CalendarView, type CalendarScript } from "@/components/calendar/CalendarView";
import { scheduleScript, unscheduleScript } from "../scripts/actions";

export default async function CalendarPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // All scripts: scheduled ones land on the grid, unscheduled ones sit in the
  // tray ready to be dragged onto a day.
  const { data, error } = await supabase
    .from("generated_scripts")
    .select("id, hook, status, scheduled_date, viral_pattern, platform, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) {
    throw new Error(error.message);
  }

  const scripts = (data ?? []) as CalendarScript[];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-semibold text-white">Calendar</h1>
        <p className="text-sm text-zinc-400">
          Drag scripts onto a day to schedule them — or drag between days to reschedule.
        </p>
      </div>

      <CalendarView
        scripts={scripts}
        scheduleAction={scheduleScript}
        unscheduleAction={unscheduleScript}
      />
    </div>
  );
}
