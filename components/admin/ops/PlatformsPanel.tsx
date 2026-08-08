"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { requestJson, notifyError } from "@/lib/utils/api";
import { PLATFORMS, PLATFORM_LABELS, type Platform } from "@/lib/publishing/types";

// Friendly on/off toggles over the same generic key/value store SettingsPanel
// edits as raw JSON (GET/PUT /api/admin/ops/settings, key "flag:platforms") —
// no dedicated route needed since "flag:" keys are already admin-editable
// there. Turning a platform off blocks NEW publish targets (composer +
// createPublishPost) for every user; it does not touch jobs already queued.

type Setting = { key: string; value: unknown; updated_at: string };
type PlatformsFlag = Record<Platform, boolean>;

const KEY = "flag:platforms";

function toFlag(value: unknown): PlatformsFlag {
  const v = (value ?? {}) as Record<string, unknown>;
  const out = {} as PlatformsFlag;
  for (const platform of PLATFORMS) out[platform] = v[platform] !== false;
  return out;
}

export function PlatformsPanel() {
  const [flag, setFlag] = useState<PlatformsFlag | null>(null);
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
      if (!signal.cancelled) notifyError(err, "Failed to load platform settings.");
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

  const toggle = async (platform: Platform) => {
    if (!flag) return;
    const next = { ...flag, [platform]: !flag[platform] };
    setSavingId(platform);
    const prev = flag;
    setFlag(next); // optimistic — a toggle switch, not a destructive action
    try {
      await requestJson("/api/admin/ops/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: KEY, value: next }),
      });
      toast.success(
        next[platform]
          ? `${PLATFORM_LABELS[platform]} publishing enabled`
          : `${PLATFORM_LABELS[platform]} publishing disabled`
      );
    } catch (err) {
      setFlag(prev);
      notifyError(err);
    } finally {
      setSavingId(null);
    }
  };

  if (loading || !flag) return <Skeleton className="h-48 rounded-xl" />;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Turn a platform off to stop every user from publishing to it — the composer treats it as
        not connected and the server rejects new jobs for it. Already-queued jobs and existing
        connections are untouched.
      </p>
      <ul className="flex flex-col gap-2">
        {PLATFORMS.map((platform) => (
          <li
            key={platform}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
          >
            <p className="text-sm font-medium text-foreground">{PLATFORM_LABELS[platform]}</p>
            <Button
              size="sm"
              variant={flag[platform] ? "default" : "outline"}
              disabled={savingId === platform}
              onClick={() => toggle(platform)}
            >
              {flag[platform] ? "On" : "Off"}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
