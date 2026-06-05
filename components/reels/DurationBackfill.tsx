"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Clock, Loader2 } from "lucide-react";

type BackfillResponse = {
  processed?: number;
  updated?: number;
  remaining?: number;
  errors?: string[];
  error?: string;
};

type DurationBackfillProps = {
  initialMissing: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function DurationBackfill({ initialMissing }: DurationBackfillProps) {
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
      // Loop batches until none remain. `remaining` strictly decreases because
      // every probed reel is marked checked server-side, so this terminates.
      for (let i = 0; i < 100; i += 1) {
        const response = await fetch("/api/reels/durations", { method: "POST" });
        const json = (await response.json()) as BackfillResponse;

        if (!response.ok || json.error) {
          setError(json.error ?? "Failed to fetch durations.");
          break;
        }

        const remaining = json.remaining ?? 0;
        setMissing(remaining);
        router.refresh();

        if (remaining <= 0) {
          setDone(true);
          break;
        }
        await sleep(600);
      }
    } catch {
      setError("Failed to fetch durations.");
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
        className="flex h-9 items-center gap-1.5 rounded-lg border border-[#262626] bg-[#141414] px-3 text-sm text-zinc-200 transition hover:border-[#F9E400]/60 hover:text-[#F9E400] disabled:opacity-50"
      >
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
        {running ? `Fetching durations… ${missing} left` : `Fetch durations (${missing})`}
      </button>

      {done && missing <= 0 ? (
        <p className="flex items-center gap-1 text-xs text-emerald-400">
          <Check className="h-3.5 w-3.5" />
          All durations loaded
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
