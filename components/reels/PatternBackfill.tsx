"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Loader2, Tags } from "lucide-react";

type BackfillResponse = {
  processed?: number;
  updated?: number;
  remaining?: number;
  error?: string;
};

type PatternBackfillProps = {
  initialMissing: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function PatternBackfill({ initialMissing }: PatternBackfillProps) {
  const router = useRouter();
  const [missing, setMissing] = useState(initialMissing);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (missing <= 0 && !done) {
    return null;
  }

  const run = async () => {
    setRunning(true);
    setError(null);
    setDone(false);

    try {
      for (let i = 0; i < 100; i += 1) {
        const response = await fetch("/api/reels/patterns", { method: "POST" });
        const json = (await response.json()) as BackfillResponse;

        if (!response.ok || json.error) {
          setError(json.error ?? "Failed to tag patterns.");
          break;
        }

        const remaining = json.remaining ?? 0;
        setMissing(remaining);
        router.refresh();

        if (remaining <= 0) {
          setDone(true);
          break;
        }
        await sleep(500);
      }
    } catch {
      setError("Failed to tag patterns.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={run}
        disabled={running || missing <= 0}
        className="flex h-9 items-center gap-1.5 rounded-lg border border-border-strong bg-surface-2 px-3 text-sm text-foreground transition hover:border-primary/60 hover:text-brand disabled:opacity-50"
      >
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tags className="h-4 w-4" />}
        {running ? `Tagging patterns… ${missing} left` : `Tag patterns (${missing})`}
      </button>

      {done && missing <= 0 ? (
        <p className="flex items-center gap-1 text-xs text-emerald-400">
          <Check className="h-3.5 w-3.5" />
          All reels tagged
        </p>
      ) : null}
      {error ? (
        <p className="flex max-w-xs items-center gap-1 text-right text-xs text-rose-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
