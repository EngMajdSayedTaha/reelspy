import { Badge } from "@/components/ui/badge";
import type { AutomationEventStatus, DmAutomationEvent } from "@/lib/auto-reply/types";

type DmEventLogProps = {
  events: DmAutomationEvent[];
};

function StatusBadge({ status }: { status: AutomationEventStatus }) {
  const styles: Record<AutomationEventStatus, string> = {
    sent: "border-emerald-500/50 bg-emerald-500/15 text-emerald-300",
    failed: "border-rose-500/50 bg-rose-500/15 text-rose-300",
    pending: "border-zinc-600 bg-zinc-500/10 text-zinc-400",
    skipped: "border-amber-500/50 bg-amber-500/15 text-amber-300",
  };
  return (
    <Badge variant="outline" className={styles[status]}>
      {status}
    </Badge>
  );
}

// Server-rendered activity log: one row per DM the bot answered.
export function DmEventLog({ events }: DmEventLogProps) {
  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-700 bg-[#101010] p-5 text-sm text-zinc-400">
        No activity yet. When someone DMs you a matching keyword, it shows up here.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[#1f1f1f] bg-[#111111]">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-[#1f1f1f] text-xs uppercase tracking-wide text-zinc-500">
            <th className="px-4 py-3 font-medium">When</th>
            <th className="px-4 py-3 font-medium">Sender</th>
            <th className="px-4 py-3 font-medium">Message</th>
            <th className="px-4 py-3 font-medium">Keyword</th>
            <th className="px-4 py-3 font-medium">Reply</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id} className="border-b border-[#1a1a1a] last:border-b-0">
              <td className="whitespace-nowrap px-4 py-3 text-zinc-400">
                {new Date(event.created_at).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-zinc-200">
                {event.sender_username ? `@${event.sender_username}` : event.sender_id ?? "—"}
              </td>
              <td className="max-w-[260px] px-4 py-3">
                <p className="truncate text-zinc-300" title={event.message_text ?? undefined}>
                  {event.message_text ?? "—"}
                </p>
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                {event.matched_keyword ? (
                  <Badge variant="outline" className="border-[#2e2e2e] text-zinc-300">
                    {event.matched_keyword === "*" ? "any" : event.matched_keyword}
                  </Badge>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-col gap-1">
                  <StatusBadge status={event.reply_status} />
                  {event.reply_error ? (
                    <span className="max-w-[200px] truncate text-xs text-rose-400" title={event.reply_error}>
                      {event.reply_error}
                    </span>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
