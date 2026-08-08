"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { requestJson, notifyError } from "@/lib/utils/api";
import { DASHBOARD_PAGES, type PagesFlag } from "@/lib/dashboard/pages";

// Friendly on/off toggles over the same generic key/value store SettingsPanel
// edits as raw JSON (GET/PUT /api/admin/ops/settings, key "flag:pages") — no
// dedicated route needed since "flag:" keys are already admin-editable there.

type Setting = { key: string; value: unknown; updated_at: string };

const KEY = "flag:pages";

function toFlag(value: unknown): PagesFlag {
  const v = (value ?? {}) as Record<string, unknown>;
  const out = {} as PagesFlag;
  for (const page of DASHBOARD_PAGES) out[page.id] = v[page.id] !== false;
  return out;
}

export function PagesPanel() {
  const [flag, setFlag] = useState<PagesFlag | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async (signal: { cancelled: boolean }) => {
    setLoading(true);
    try {
      const res = await requestJson<{ settings: Setting[] }>("/api/admin/ops/settings");
      if (signal.cancelled) return;
      const row = res.settings.find((s) => s.key === KEY);
      setFlag(toFlag(row?.value));
    } catch (err) {
      if (!signal.cancelled) notifyError(err, "Failed to load page settings.");
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

  const toggle = async (id: keyof PagesFlag) => {
    if (!flag) return;
    const next = { ...flag, [id]: !flag[id] };
    setSavingId(id);
    const prev = flag;
    setFlag(next); // optimistic — a toggle switch, not a destructive action
    try {
      await requestJson("/api/admin/ops/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: KEY, value: next }),
      });
      toast.success(next[id] ? "Page enabled" : "Page hidden from every user's sidebar");
    } catch (err) {
      setFlag(prev);
      notifyError(err);
    } finally {
      setSavingId(null);
    }
  };

  if (loading || !flag) return <Skeleton className="h-64 rounded-xl" />;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Turn a page off to hide it from every user&apos;s dashboard sidebar and block direct
        navigation to it. Nothing is deleted — this only controls visibility.
      </p>
      <ul className="flex flex-col gap-2">
        {DASHBOARD_PAGES.map((page) => (
          <li
            key={page.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{page.label}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">{page.href}</p>
            </div>
            <Button
              size="sm"
              variant={flag[page.id] ? "default" : "outline"}
              disabled={savingId === page.id}
              onClick={() => toggle(page.id)}
            >
              {flag[page.id] ? "On" : "Off"}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
