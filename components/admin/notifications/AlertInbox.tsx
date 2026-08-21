"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { Check, CheckCheck, ExternalLink, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { requestJson, notifyError } from "@/lib/utils/api";
import { cn } from "@/lib/utils";
import {
  ALERT_CATEGORIES,
  CATEGORY_LABELS,
  SEVERITIES,
  type AlertCategory,
  type Severity,
} from "@/lib/notifications/catalog";
import { SegmentedControl } from "@/components/admin/notifications/Toggle";
import { SeverityChip } from "@/components/admin/notifications/AlertSettings";
import type { AdminAlertRow, AlertCounts, AlertsResponse } from "@/components/admin/notifications/types";

// What the delivery column means, in the founder's words. The raw values are
// stored so this can be explained rather than guessed at — "why didn't I get an
// email about this?" is the question this column exists to answer.
const DELIVERY_LABELS: Record<string, { label: string; tone: string }> = {
  emailed: { label: "Emailed", tone: "bg-success/15 text-success" },
  digested: { label: "In digest", tone: "bg-success/10 text-success" },
  pending: { label: "Waiting for digest", tone: "bg-warning/15 text-warning" },
  suppressed: { label: "Folded into an earlier alert", tone: "bg-secondary text-muted-foreground" },
  dropped: { label: "Not emailed", tone: "bg-secondary text-muted-foreground" },
  failed: { label: "Send failed", tone: "bg-destructive/15 text-destructive" },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  if (!Number.isFinite(diff)) return "";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function AlertInbox({ onCounts }: { onCounts?: (counts: AlertCounts) => void }) {
  const [alerts, setAlerts] = useState<AdminAlertRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [severity, setSeverity] = useState<Severity | "all">("all");
  const [category, setCategory] = useState<AlertCategory | "all">("all");
  const [unresolvedOnly, setUnresolvedOnly] = useState(true);

  const query = useCallback(
    (before?: string | null) => {
      const params = new URLSearchParams();
      if (severity !== "all") params.set("severity", severity);
      if (category !== "all") params.set("category", category);
      if (unresolvedOnly) params.set("unresolved", "1");
      if (before) params.set("before", before);
      return `/api/admin/notifications/alerts?${params.toString()}`;
    },
    [severity, category, unresolvedOnly]
  );

  const load = useCallback(
    async (signal: { cancelled: boolean }) => {
      setLoading(true);
      try {
        const res = await requestJson<AlertsResponse>(query());
        if (signal.cancelled) return;
        setAlerts(res.alerts);
        setCursor(res.nextCursor);
        onCounts?.(res.counts);
      } catch (err) {
        if (!signal.cancelled) notifyError(err, "Failed to load alerts.");
      } finally {
        if (!signal.cancelled) setLoading(false);
      }
    },
    [query, onCounts]
  );

  useEffect(() => {
    const signal = { cancelled: false };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [load]);

  const loadMore = async () => {
    if (!cursor) return;
    setActing("more");
    try {
      const res = await requestJson<AlertsResponse>(query(cursor));
      setAlerts((prev) => [...prev, ...res.alerts]);
      setCursor(res.nextCursor);
    } catch (err) {
      notifyError(err);
    } finally {
      setActing(null);
    }
  };

  const act = async (
    action: "read" | "resolve" | "reopen",
    body: { ids?: string[]; all?: boolean }
  ) => {
    setActing(action + (body.ids?.[0] ?? ""));
    try {
      const res = await requestJson<{ changed: number; counts: AlertCounts }>(
        "/api/admin/notifications/alerts",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...body }),
        }
      );
      onCounts?.(res.counts);

      const now = new Date().toISOString();
      setAlerts((prev) =>
        prev.map((a) => {
          const hit = body.all || (body.ids ?? []).includes(a.id);
          if (!hit) return a;
          if (action === "read") return { ...a, read_at: a.read_at ?? now };
          if (action === "resolve") return { ...a, resolved_at: now, read_at: a.read_at ?? now };
          return { ...a, resolved_at: null };
        })
      );
      if (action === "resolve") toast.success(`Resolved ${res.changed}`);
    } catch (err) {
      notifyError(err);
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl<string>
          ariaLabel="Filter by severity"
          value={severity}
          options={[
            { value: "all", label: "All" },
            ...SEVERITIES.map((s) => ({
              value: s,
              label: s === "info" ? "FYI" : s === "warning" ? "Needs a look" : "Act now",
            })),
          ]}
          onChange={(v) => setSeverity(v as Severity | "all")}
        />
        <SegmentedControl<string>
          ariaLabel="Filter by category"
          value={category}
          options={[
            { value: "all", label: "All areas" },
            ...ALERT_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] })),
          ]}
          onChange={(v) => setCategory(v as AlertCategory | "all")}
        />
        <SegmentedControl<string>
          ariaLabel="Filter by state"
          value={unresolvedOnly ? "open" : "all"}
          options={[
            { value: "open", label: "Open" },
            { value: "all", label: "Everything" },
          ]}
          onChange={(v) => setUnresolvedOnly(v === "open")}
        />
        <div className="ms-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={acting !== null}
            onClick={() => void act("read", { all: true })}
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
      ) : alerts.length === 0 ? (
        <div className="rounded-xl bg-card p-8 text-center ring-1 ring-foreground/10">
          <p className="text-sm font-medium text-foreground">Nothing here</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {unresolvedOnly
              ? "No open alerts. Either nothing has gone wrong, or you've dealt with all of it."
              : "No alerts match this filter."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {alerts.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              busy={acting !== null}
              onRead={() => void act("read", { ids: [alert.id] })}
              onResolve={() => void act("resolve", { ids: [alert.id] })}
              onReopen={() => void act("reopen", { ids: [alert.id] })}
            />
          ))}
        </div>
      )}

      {cursor ? (
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="self-center"
          disabled={acting !== null}
          onClick={() => void loadMore()}
        >
          {acting === "more" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Load older
        </Button>
      ) : null}
    </div>
  );
}

function AlertCard({
  alert,
  busy,
  onRead,
  onResolve,
  onReopen,
}: {
  alert: AdminAlertRow;
  busy: boolean;
  onRead: () => void;
  onResolve: () => void;
  onReopen: () => void;
}) {
  const delivery = DELIVERY_LABELS[alert.delivery] ?? {
    label: alert.delivery,
    tone: "bg-secondary text-muted-foreground",
  };
  const resolved = Boolean(alert.resolved_at);
  const unread = !alert.read_at;
  const context = Object.entries(alert.context ?? {});

  return (
    <article
      className={cn(
        "rounded-xl bg-card p-4 ring-1 transition",
        resolved ? "opacity-60 ring-foreground/10" : "ring-foreground/10",
        // The unread accent is a left rule, not a background: a wall of tinted
        // cards after an incident is unreadable.
        unread && !resolved ? "border-s-2 border-accent-brand" : ""
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityChip severity={alert.severity} />
            <h3 className="text-sm font-semibold text-foreground">{alert.title}</h3>
            {alert.repeat_count > 1 ? (
              <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                ×{alert.repeat_count}
              </span>
            ) : null}
          </div>
          {alert.summary ? (
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">{alert.summary}</p>
          ) : null}

          {context.length > 0 ? (
            <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {context.map(([label, value]) => (
                <div key={label} className="flex items-baseline gap-1.5">
                  <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
                  <dd className="text-xs font-medium text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span title={new Date(alert.created_at).toLocaleString()}>{timeAgo(alert.created_at)}</span>
            <span>·</span>
            <span className={cn("rounded px-1.5 py-0.5 font-medium", delivery.tone)}>
              {delivery.label}
            </span>
            {alert.delivery_reason && alert.delivery !== "emailed" ? (
              <span title="Why it was routed this way">({alert.delivery_reason})</span>
            ) : null}
            <span>·</span>
            <code className="text-[10px]">{alert.event}</code>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {alert.link ? (
            <Button type="button" variant="outline" size="sm" asChild>
              <Link href={alert.link}>
                <ExternalLink className="h-3.5 w-3.5" />
                Open
              </Link>
            </Button>
          ) : null}
          {unread ? (
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onRead}>
              Mark read
            </Button>
          ) : null}
          {resolved ? (
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onReopen}>
              <RotateCcw className="h-3.5 w-3.5" />
              Reopen
            </Button>
          ) : (
            <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={onResolve}>
              <Check className="h-3.5 w-3.5" />
              Resolve
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
