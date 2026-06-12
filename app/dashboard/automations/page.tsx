import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { AutomationCard } from "@/components/automations/AutomationCard";
import { AutomationForm } from "@/components/automations/AutomationForm";
import { DmAutomationCard } from "@/components/automations/DmAutomationCard";
import { DmAutomationForm } from "@/components/automations/DmAutomationForm";
import { DmEventLog } from "@/components/automations/DmEventLog";
import { EventLog } from "@/components/automations/EventLog";
import { createClient } from "@/lib/supabase/server";
import type {
  AutomationEvent,
  DmAutomation,
  DmAutomationEvent,
  ReelAutomation,
} from "@/lib/auto-reply/types";
import {
  createAutomation,
  createDmAutomation,
  deleteAutomation,
  deleteDmAutomation,
  toggleAutomationActive,
  toggleDmAutomationActive,
  updateAutomation,
  updateDmAutomation,
} from "./actions";

const EVENT_LOG_LIMIT = 50;

export default async function AutomationsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [
    { data: profile },
    { data: automationRows, error },
    { data: eventRows },
    { data: dmAutomationRows },
    { data: dmEventRows },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("ig_user_id, ig_token_status, webhook_subscribed_at")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("reel_automations")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("automation_events")
      .select(
        "id, automation_id, comment_id, ig_media_id, comment_text, commenter_id, commenter_username, matched_keyword, like_status, like_error, public_reply_status, public_reply_error, dm_status, dm_error, created_at, processed_at"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(EVENT_LOG_LIMIT),
    supabase
      .from("dm_automations")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("dm_automation_events")
      .select(
        "id, automation_id, message_id, sender_id, sender_username, message_text, matched_keyword, reply_status, reply_error, created_at, processed_at"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(EVENT_LOG_LIMIT),
  ]);

  if (error) {
    throw new Error(error.message);
  }

  const automations = (automationRows ?? []) as ReelAutomation[];
  const events = (eventRows ?? []) as AutomationEvent[];
  const dmAutomations = (dmAutomationRows ?? []) as DmAutomation[];
  const dmEvents = (dmEventRows ?? []) as DmAutomationEvent[];

  const connected = Boolean(profile?.ig_user_id) && profile?.ig_token_status !== "invalid";
  const needsReconnect = connected && !profile?.webhook_subscribed_at;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-semibold text-white">Auto-Reply</h1>
        <p className="text-sm text-zinc-400">
          Link a reel to keywords. When a follower comments a keyword, ReelSpy replies publicly
          and DMs them your link — automatically.
        </p>
      </div>

      {!connected ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Connect your Instagram account first (Settings → Instagram). Auto-Reply needs an
            Instagram Business/Creator account linked to a Facebook Page.
          </p>
        </div>
      ) : needsReconnect ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Your connection predates Auto-Reply. Go to Settings → Instagram and{" "}
            <span className="font-medium">reconnect</span> to grant the comment & messaging
            permissions and activate webhook delivery — until then, automations won&apos;t fire.
          </p>
        </div>
      ) : null}

      <AutomationForm
        action={createAutomation}
        automatedMediaIds={automations.map((a) => a.ig_media_id)}
      />

      {automations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-700 bg-[#101010] p-5 text-sm text-zinc-400">
          No automations yet. Pick a reel above, choose your keywords, and write the DM to send.
        </div>
      ) : (
        <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {automations.map((automation) => (
            <AutomationCard
              key={automation.id}
              automation={automation}
              updateAction={updateAutomation}
              toggleActiveAction={toggleAutomationActive}
              deleteAction={deleteAutomation}
            />
          ))}
        </div>
      )}

      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-white">Activity</h2>
        <EventLog events={events} />
      </div>

      <div className="space-y-1 border-t border-[#1f1f1f] pt-6">
        <h2 className="text-xl font-semibold text-white">DM Auto-Reply</h2>
        <p className="text-sm text-zinc-400">
          Answer incoming direct messages that contain your keywords. Story replies are always
          ignored.
        </p>
      </div>

      <DmAutomationForm action={createDmAutomation} />

      {dmAutomations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-700 bg-[#101010] p-5 text-sm text-zinc-400">
          No DM automations yet. Add keywords above (e.g. &ldquo;price&rdquo;, &ldquo;link&rdquo;)
          and the reply to send.
        </div>
      ) : (
        <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {dmAutomations.map((automation) => (
            <DmAutomationCard
              key={automation.id}
              automation={automation}
              updateAction={updateDmAutomation}
              toggleActiveAction={toggleDmAutomationActive}
              deleteAction={deleteDmAutomation}
            />
          ))}
        </div>
      )}

      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-white">DM Activity</h2>
        <DmEventLog events={dmEvents} />
      </div>
    </div>
  );
}
