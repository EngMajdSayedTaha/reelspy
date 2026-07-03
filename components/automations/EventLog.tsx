import { Badge } from "@/components/ui/badge";
import type { AutomationEvent, AutomationEventStatus } from "@/lib/auto-reply/types";

type EventLogProps = {
  events: AutomationEvent[];
};

function StatusBadge({ status }: { status: AutomationEventStatus }) {
  const styles: Record<AutomationEventStatus, string> = {
    sent: "border-success/50 bg-success/15 text-success",
    failed: "border-danger/50 bg-danger/15 text-danger",
    pending: "border-border-strong bg-border-strong/10 text-muted-foreground",
    skipped: "border-warning/50 bg-warning/15 text-warning",
  };
  return (
    <Badge variant="outline" className={styles[status]}>
      {status}
    </Badge>
  );
}

// Server-rendered activity log: one row per comment the bot acted on.
export function EventLog({ events }: EventLogProps) {
  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border-strong bg-background p-5 text-sm text-muted-foreground">
        No activity yet. When a follower comments one of your keywords, it shows up here.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[680px] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-subtle">
            <th className="px-4 py-3 font-medium">When</th>
            <th className="px-4 py-3 font-medium">Follower</th>
            <th className="px-4 py-3 font-medium">Comment</th>
            <th className="px-4 py-3 font-medium">Keyword</th>
            <th className="px-4 py-3 font-medium">Reply</th>
            <th className="px-4 py-3 font-medium">DM</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id} className="border-b border-secondary last:border-b-0">
              <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                {new Date(event.created_at).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-foreground">
                {event.commenter_username ? `@${event.commenter_username}` : "—"}
              </td>
              <td className="max-w-[260px] px-4 py-3">
                <p className="truncate text-muted-foreground" title={event.comment_text ?? undefined}>
                  {event.comment_text ?? "—"}
                </p>
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                {event.matched_keyword ? (
                  <Badge variant="outline" className="border-border-strong text-muted-foreground">
                    {event.matched_keyword === "*" ? "any" : event.matched_keyword}
                  </Badge>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-col gap-1">
                  <StatusBadge status={event.public_reply_status} />
                  {event.public_reply_error ? (
                    <span className="max-w-[200px] truncate text-xs text-danger" title={event.public_reply_error}>
                      {event.public_reply_error}
                    </span>
                  ) : null}
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-col gap-1">
                  <StatusBadge status={event.dm_status} />
                  {event.dm_error ? (
                    <span className="max-w-[200px] truncate text-xs text-danger" title={event.dm_error}>
                      {event.dm_error}
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
