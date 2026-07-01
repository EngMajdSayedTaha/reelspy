"use client";

import { useEffect, useState } from "react";
import { Sparkles, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiThinking } from "@/components/ui/ai-thinking";

type GrowthNotesProps = {
  connected?: boolean;
};

type NotesResponse = {
  notes?: string[];
  degraded?: boolean;
  analyzed?: number;
  error?: string;
};

const POST_COUNTS = [10, 20, 50] as const;
type PostCount = (typeof POST_COUNTS)[number];

const THINKING_MESSAGES = [
  "Reading your recent posts…",
  "Spotting engagement patterns…",
  "Comparing timing and formats…",
  "Writing data-backed recommendations…",
];

// Reveals an array of notes one after another, word by word, like an AI typing
// its answer. Notes not yet reached stay hidden; the active one shows a caret.
// All state changes happen inside the interval callback (not the effect body) so
// the reveal can't trigger cascading synchronous renders.
function TypewriterNotes({ notes }: { notes: string[] }) {
  // idx = note currently typing; text = its revealed-so-far content. idx beyond
  // the list means every note is fully shown and the caret is gone.
  const [progress, setProgress] = useState<{ idx: number; text: string }>({ idx: 0, text: "" });

  useEffect(() => {
    let idx = 0;
    let i = 0;
    // Split keeping whitespace tokens so re-joining preserves spacing.
    let tokens = notes[0]?.split(/(\s+)/) ?? [];

    const id = setInterval(() => {
      if (idx >= notes.length) {
        clearInterval(id);
        setProgress({ idx: notes.length, text: "" });
        return;
      }
      i += 1;
      setProgress({ idx, text: tokens.slice(0, i).join("") });
      if (i >= tokens.length) {
        idx += 1;
        i = 0;
        tokens = notes[idx]?.split(/(\s+)/) ?? [];
      }
    }, 28);

    return () => clearInterval(id);
  }, [notes]);

  return (
    <ol className="space-y-2">
      {notes.map((note, i) => {
        if (i > progress.idx) return null;
        const isActive = i === progress.idx;
        return (
          <li
            key={i}
            className="flex animate-in fade-in slide-in-from-bottom-1 gap-3 rounded-lg border border-border-strong bg-background p-3 text-sm text-foreground duration-300"
          >
            <span className="shrink-0 font-mono text-brand">{i + 1}.</span>
            <span>
              {isActive ? progress.text : note}
              {isActive ? (
                <span className="ml-0.5 inline-block w-1.5 animate-pulse text-brand">▍</span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function GrowthNotes({ connected = false }: GrowthNotesProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);
  const [degraded, setDegraded] = useState(false);
  const [analyzed, setAnalyzed] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [postCount, setPostCount] = useState<PostCount>(20);

  const generate = async () => {
    setIsLoading(true);
    setError(null);
    setNotes([]);
    setDegraded(false);
    setAnalyzed(null);

    // Above the server's ~60s AI budget so this only trips if the request
    // itself wedges — the "Analyzing…" state can never hang forever.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 70_000);

    try {
      const response = await fetch("/api/growth-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: postCount }),
        signal: controller.signal,
      });
      const json = (await response.json()) as NotesResponse;

      if (!response.ok || json.error) {
        setError(json.error ?? "Failed to generate notes.");
      } else {
        setNotes(json.notes ?? []);
        setDegraded(Boolean(json.degraded));
        setAnalyzed(typeof json.analyzed === "number" ? json.analyzed : null);
      }
    } catch (err) {
      setError(
        err instanceof DOMException && err.name === "AbortError"
          ? "This took too long and timed out. Please try again."
          : "Failed to generate notes."
      );
    } finally {
      clearTimeout(timer);
      setIsLoading(false);
    }
  };

  return (
    <section className="relative space-y-4 overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-br from-primary/[0.07] via-card to-card p-5 text-foreground">
      {/* Soft brand glow in the corner to make the AI card feel alive. */}
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/10 blur-3xl" />

      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Sparkles className="h-5 w-5 text-brand" />
            AI Growth Notes
          </h2>
          <p className="text-sm text-muted-foreground">
            Data-backed recommendations generated from your most recent posts.
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          {/* Post-count selector — controls how many recent posts the AI reads. */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-subtle">Analyze last</span>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-surface-2 p-0.5">
              {POST_COUNTS.map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setPostCount(count)}
                  disabled={isLoading}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                    postCount === count
                      ? "bg-primary text-black"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {count}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-subtle">posts</span>
          </div>

          <Button type="button" onClick={generate} disabled={isLoading || !connected}>
            <Sparkles className={`h-4 w-4 ${isLoading ? "animate-pulse" : ""}`} />
            {isLoading ? "Analyzing…" : notes.length > 0 ? "Regenerate" : "Generate Notes"}
          </Button>
        </div>
      </div>

      {!connected ? (
        <p className="relative text-sm text-amber-400">
          Connect Instagram to generate AI growth notes.
        </p>
      ) : null}

      {error ? <p className="relative text-sm text-rose-400">{error}</p> : null}

      {isLoading ? <AiThinking messages={THINKING_MESSAGES} className="relative" /> : null}

      {!isLoading && notes.length > 0 ? (
        <div className="relative space-y-2">
          {degraded ? (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
              Showing general guidance — live AI notes weren&apos;t available this time. Try again in
              a moment.
            </p>
          ) : null}

          <TypewriterNotes notes={notes} />

          {!degraded && analyzed != null ? (
            <p className="flex items-center gap-1.5 pt-1 text-[11px] text-subtle">
              <TrendingUp className="h-3 w-3" />
              Based on your {analyzed} most recent {analyzed === 1 ? "post" : "posts"}.
            </p>
          ) : null}
        </div>
      ) : null}

      {!isLoading && notes.length === 0 && !error && connected ? (
        <p className="relative text-sm text-subtle">
          Pick how many recent posts to analyze, then generate AI recommendations from your
          Instagram data.
        </p>
      ) : null}
    </section>
  );
}
