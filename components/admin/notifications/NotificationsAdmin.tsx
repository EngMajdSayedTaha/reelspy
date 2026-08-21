"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, BellRing, Inbox, Mail, Timer } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/admin/StatCard";
import { requestJson, notifyError } from "@/lib/utils/api";
import { cn } from "@/lib/utils";
import { AlertInbox } from "@/components/admin/notifications/AlertInbox";
import { AlertSettings } from "@/components/admin/notifications/AlertSettings";
import type { AlertCounts, SettingsResponse } from "@/components/admin/notifications/types";

const TABS = [
  { id: "inbox", label: "Inbox" },
  { id: "settings", label: "Settings" },
] as const;

type TabId = (typeof TABS)[number]["id"];

// Inbox first, settings second. The founder opens this page because something
// happened far more often than to change what happens — and a settings screen
// that hides the alerts it produced is how alerting quietly stops being read.
export function NotificationsAdmin() {
  const [tab, setTab] = useState<TabId>("inbox");
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [counts, setCounts] = useState<AlertCounts | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (signal: { cancelled: boolean }) => {
    setLoading(true);
    try {
      const res = await requestJson<SettingsResponse>("/api/admin/notifications/settings");
      if (signal.cancelled) return;
      setSettings(res);
      setCounts(res.counts);
    } catch (err) {
      if (!signal.cancelled) notifyError(err, "Failed to load alert settings.");
    } finally {
      if (!signal.cancelled) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const signal = { cancelled: false };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [load]);

  const onCounts = useCallback((next: AlertCounts) => setCounts(next), []);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Open alerts"
          value={counts?.unresolved ?? "—"}
          icon={<Inbox className="h-4 w-4" />}
          hint={counts?.unread ? `${counts.unread} unread` : undefined}
        />
        <StatCard
          label="Needs action now"
          value={counts?.criticalUnresolved ?? "—"}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone={counts && counts.criticalUnresolved > 0 ? "danger" : "default"}
        />
        <StatCard
          label="Last 24 hours"
          value={counts?.last24h ?? "—"}
          icon={<BellRing className="h-4 w-4" />}
        />
        <StatCard
          label="Waiting for digest"
          value={counts?.pendingDigest ?? "—"}
          icon={<Timer className="h-4 w-4" />}
        />
      </div>

      {settings && !settings.delivery.emailConfigured ? (
        <div className="flex items-start gap-2 rounded-xl bg-warning/10 p-4 text-sm text-warning ring-1 ring-warning/20">
          <Mail className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Alerts are being recorded but not emailed — this deployment has no mailer configured. Set{" "}
            <code>RESEND_API_KEY</code> and <code>EMAIL_FROM</code>, then send yourself a test from
            Settings.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition",
              tab === t.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
            {t.id === "inbox" && counts?.unread ? (
              <span className="ms-1.5 rounded-full bg-accent-brand/20 px-1.5 py-0.5 text-[10px] font-bold text-accent-brand">
                {counts.unread}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === "inbox" ? <AlertInbox onCounts={onCounts} /> : null}

      {tab === "settings" ? (
        loading || !settings ? (
          <Skeleton className="h-96 rounded-xl" />
        ) : (
          <AlertSettings
            prefs={settings.prefs}
            events={settings.events}
            delivery={settings.delivery}
            // A save returns no counts — merge onto what we already have rather
            // than blanking the tiles on every toggle. `prev` can't be null
            // here: this branch only renders once settings have loaded.
            onChange={(next) =>
              setSettings((prev) => (prev ? { ...prev, ...next } : prev))
            }
          />
        )
      ) : null}
    </div>
  );
}
