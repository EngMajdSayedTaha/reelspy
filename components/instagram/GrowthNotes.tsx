"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type GrowthNotesProps = {
  connected?: boolean;
};

export function GrowthNotes({ connected = false }: GrowthNotesProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/growth-notes", { method: "POST" });
      const json = (await response.json()) as { notes?: string[]; error?: string };

      if (!response.ok || json.error) {
        setError(json.error ?? "Failed to generate notes.");
      } else {
        setNotes(json.notes ?? []);
      }
    } catch {
      setError("Failed to generate notes.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="space-y-4 rounded-xl border border-[#1f1f1f] bg-[#111111] p-5 text-zinc-100">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">AI Growth Notes</h2>
          <p className="text-sm text-zinc-400">
            Data-backed recommendations from your last 20 posts.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={generate}
          disabled={isLoading || !connected}
        >
          {isLoading ? "Analyzing..." : "Generate Notes"}
        </Button>
      </div>

      {!connected ? (
        <p className="text-sm text-amber-400">Connect Instagram to generate AI growth notes.</p>
      ) : null}

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      {notes.length > 0 ? (
        <ul className="space-y-2">
          {notes.map((note, i) => (
            <li
              key={i}
              className="flex gap-3 rounded-md border border-zinc-800 bg-[#0d0d0d] p-3 text-sm text-zinc-200"
            >
              <span className="shrink-0 font-mono text-[#F9E400]">{i + 1}.</span>
              <span>{note}</span>
            </li>
          ))}
        </ul>
      ) : notes.length === 0 && !isLoading && !error && connected ? (
        <p className="text-sm text-zinc-500">
          Click Generate Notes to get AI recommendations based on your Instagram data.
        </p>
      ) : null}
    </section>
  );
}
