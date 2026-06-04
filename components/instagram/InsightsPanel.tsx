"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type InsightsPanelProps = {
  connected: boolean;
};

type InsightItem = {
  key: string;
  value: number;
};

export function InsightsPanel({ connected }: InsightsPanelProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [insights, setInsights] = useState<InsightItem[]>([]);

  const runSync = async () => {
    setIsSyncing(true);
    setError(null);
    setSyncMessage(null);

    try {
      const response = await fetch("/api/ig/sync", { method: "POST" });
      const json = (await response.json()) as {
        inserted?: number;
        skipped?: number;
        error?: string;
      };

      if (!response.ok || json.error) {
        setError(json.error ?? "Sync failed.");
      } else {
        setSyncMessage(`Sync complete: inserted ${json.inserted ?? 0}, skipped ${json.skipped ?? 0}.`);
      }
    } catch {
      setError("Sync failed.");
    } finally {
      setIsSyncing(false);
    }
  };

  const loadInsights = async () => {
    setIsLoadingInsights(true);
    setError(null);

    try {
      const response = await fetch("/api/ig/insights", { method: "GET" });
      const json = (await response.json()) as {
        connected?: boolean;
        insights?: InsightItem[];
        error?: string;
      };

      if (!response.ok || json.error) {
        setError(json.error ?? "Failed to load insights.");
      } else {
        setInsights(json.insights ?? []);
      }
    } catch {
      setError("Failed to load insights.");
    } finally {
      setIsLoadingInsights(false);
    }
  };

  return (
    <section className="space-y-4 rounded-xl border border-[#1f1f1f] bg-[#111111] p-5 text-zinc-100">
      <div>
        <h2 className="text-lg font-semibold text-white">Instagram Sync + Insights</h2>
        <p className="text-sm text-zinc-400">Sync reels and pull lightweight account insights.</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={runSync} disabled={!connected || isSyncing}>
          {isSyncing ? "Syncing..." : "Sync Recent Reels"}
        </Button>
        <Button type="button" variant="outline" onClick={loadInsights} disabled={!connected || isLoadingInsights}>
          {isLoadingInsights ? "Loading..." : "Load Insights"}
        </Button>
      </div>

      {syncMessage ? <p className="text-sm text-emerald-400">{syncMessage}</p> : null}
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      {insights.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {insights.map((item) => (
            <div key={item.key} className="rounded-md border border-zinc-700 bg-[#0d0d0d] p-3">
              <p className="text-xs uppercase tracking-wide text-zinc-400">{item.key.replaceAll("_", " ")}</p>
              <p className="text-lg font-semibold text-white">{item.value}</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
