"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JsonViewer } from "@/components/admin/JsonViewer";
import { requestJson, notifyError } from "@/lib/utils/api";

const CRON_ROUTES: { name: string; desc: string }[] = [
  { name: "run-jobs", desc: "Work the durable job queue" },
  { name: "enrich-seeds", desc: "Validate + enrich seed accounts via Meta" },
  { name: "refresh-snapshots", desc: "Refresh IG account/reel snapshots" },
  { name: "refresh-tokens", desc: "Refresh expiring IG/FB tokens" },
  { name: "poll-comments", desc: "Poll IG comments for auto-reply" },
  { name: "poll-youtube-comments", desc: "Poll YouTube comments" },
  { name: "prune-events", desc: "Prune old app_events rows" },
  { name: "weekly-digest", desc: "Fan out the weekly digest" },
  { name: "ig-cookie-health", desc: "Check IG cookie health" },
];

export function CronPanel() {
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<{ name: string; status: number; ok: boolean; result: unknown } | null>(null);

  const run = async (name: string) => {
    setRunning(name);
    setResult(null);
    try {
      const res = await requestJson<{ name: string; status: number; ok: boolean; result: unknown }>(
        "/api/admin/ops/cron",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
          timeoutMs: 300_000,
        }
      );
      setResult(res);
      if (res.ok) toast.success(`${name} finished (${res.status})`);
      else toast.error(`${name} returned ${res.status}`);
    } catch (err) {
      notifyError(err);
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {CRON_ROUTES.map((c) => (
          <div
            key={c.name}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-4 py-3"
          >
            <div>
              <p className="font-mono text-sm text-foreground">{c.name}</p>
              <p className="text-xs text-muted-foreground">{c.desc}</p>
            </div>
            <Button variant="secondary" size="sm" disabled={running !== null} onClick={() => run(c.name)}>
              <Play className="h-3.5 w-3.5" />
              {running === c.name ? "Running…" : "Run"}
            </Button>
          </div>
        ))}
      </div>

      {result ? (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="mb-2 text-sm">
            Last run: <span className="font-mono">{result.name}</span> ·{" "}
            <span className={result.ok ? "text-success" : "text-destructive"}>HTTP {result.status}</span>
          </p>
          <JsonViewer data={result.result} label="response" defaultOpen />
        </div>
      ) : null}
    </div>
  );
}
