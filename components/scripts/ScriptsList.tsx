"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ExternalLink, History, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type SourceAccount = { ig_username: string; avatar_url: string | null };

type SourceReel = {
  id: string;
  thumbnail_url: string | null;
  ig_permalink: string;
  inspiration_accounts: SourceAccount | SourceAccount[] | null;
};

export type ScriptRow = {
  id: string;
  hook: string | null;
  body: string | null;
  cta: string | null;
  viral_pattern: string | null;
  platform: string | null;
  status: string | null;
  scheduled_date: string | null;
  created_at: string;
  tracked_reels?: SourceReel | SourceReel[] | null;
};

function sourceReelOf(script: ScriptRow): SourceReel | null {
  const reel = Array.isArray(script.tracked_reels)
    ? script.tracked_reels[0]
    : script.tracked_reels;
  return reel ?? null;
}

function sourceAccountOf(reel: SourceReel): SourceAccount | null {
  const acc = Array.isArray(reel.inspiration_accounts)
    ? reel.inspiration_accounts[0]
    : reel.inspiration_accounts;
  return acc ?? null;
}

type ScriptsListProps = {
  scripts: ScriptRow[];
  deleteAction: (formData: FormData) => Promise<void>;
  updateStatusAction: (id: string, status: "draft" | "ready" | "published") => Promise<void>;
  scheduleAction: (id: string, date: string) => Promise<void>;
};

const STATUS_OPTIONS = ["draft", "ready", "published"] as const;
const STATUS_COLORS: Record<string, string> = {
  draft: "border-zinc-600 text-zinc-400",
  ready: "border-blue-500/50 text-blue-400",
  published: "border-emerald-500/50 text-emerald-400",
};

const FILTER_OPTIONS = ["all", "draft", "ready", "published"] as const;

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="text-xs text-zinc-500 transition hover:text-[#F9E400]"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function ScriptCard({
  script,
  deleteAction,
  updateStatusAction,
  scheduleAction,
}: {
  script: ScriptRow;
  deleteAction: (formData: FormData) => Promise<void>;
  updateStatusAction: (id: string, status: "draft" | "ready" | "published") => Promise<void>;
  scheduleAction: (id: string, date: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(script.scheduled_date ?? "");
  const sourceReel = sourceReelOf(script);
  const sourceAccount = sourceReel ? sourceAccountOf(sourceReel) : null;

  const status = (script.status ?? "draft") as "draft" | "ready" | "published";
  const fullScript = `[HOOK]\n${script.hook ?? ""}\n\n[BODY]\n${script.body ?? ""}\n\n[CTA]\n${script.cta ?? ""}`;

  const handleStatusChange = (newStatus: "draft" | "ready" | "published") => {
    startTransition(async () => {
      await updateStatusAction(script.id, newStatus);
    });
  };

  const handleSchedule = () => {
    if (!scheduleDate) return;
    startTransition(async () => {
      await scheduleAction(script.id, scheduleDate);
      setShowSchedule(false);
    });
  };

  return (
    // Anchor target for calendar "Open script" links: scrolls clear of the
    // sticky top bar and lights up when it's the URL hash.
    <article
      id={`script-${script.id}`}
      className="scroll-mt-24 space-y-3 rounded-xl border border-[#1f1f1f] bg-[#111111] p-4 target:border-[#F9E400]/60 target:ring-2 target:ring-[#F9E400]/20"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_COLORS[status] ?? STATUS_COLORS.draft}`}
          >
            {status}
          </span>
          {script.viral_pattern ? (
            <Badge variant="outline" className="text-xs text-[#F9E400] border-[#F9E400]/30">
              {script.viral_pattern}
            </Badge>
          ) : null}
          {script.platform ? (
            <span className="text-xs text-zinc-500">{script.platform}</span>
          ) : null}
          {script.scheduled_date ? (
            <span className="text-xs text-blue-400">Scheduled: {script.scheduled_date}</span>
          ) : null}
        </div>
        <p className="text-xs text-zinc-500">
          {new Date(script.created_at).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </p>
      </div>

      {/* Source reel this script was generated from */}
      {sourceReel ? (
        <div className="flex items-center gap-2.5 rounded-lg border border-[#262626] bg-[#0d0d0d] p-2">
          {sourceReel.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={sourceReel.thumbnail_url}
              alt="Source reel"
              referrerPolicy="no-referrer"
              className="h-12 w-9 shrink-0 rounded-md object-cover"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wide text-zinc-600">Source reel</p>
            <p className="truncate text-xs text-zinc-300">
              {sourceAccount ? `@${sourceAccount.ig_username}` : "Tracked reel"}
            </p>
          </div>
          <Link
            href={`/dashboard/generate/${sourceReel.id}`}
            className="shrink-0 text-xs text-[#F9E400] underline-offset-4 hover:underline"
          >
            Open
          </Link>
          <a
            href={sourceReel.ig_permalink}
            target="_blank"
            rel="noreferrer"
            title="Open on Instagram"
            aria-label="Open on Instagram"
            className="shrink-0 text-zinc-500 transition hover:text-[#F9E400]"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      ) : null}

      {/* Hook always visible */}
      <div>
        <p className="text-xs uppercase tracking-wide text-zinc-600">Hook</p>
        <p className="mt-0.5 text-sm text-zinc-100">{script.hook}</p>
      </div>

      {/* Expandable body + cta */}
      {expanded ? (
        <>
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-600">Body</p>
            <p className="mt-0.5 whitespace-pre-line text-sm text-zinc-200">{script.body}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-600">CTA</p>
            <p className="mt-0.5 text-sm text-zinc-200">{script.cta}</p>
          </div>
        </>
      ) : null}

      {/* Schedule input */}
      {showSchedule ? (
        <div className="flex gap-2">
          <input
            type="date"
            aria-label="Publish date"
            value={scheduleDate}
            onChange={(e) => setScheduleDate(e.target.value)}
            className="rounded-md border border-zinc-700 bg-[#0d0d0d] px-2 py-1 text-sm text-zinc-100"
          />
          <Button type="button" size="sm" onClick={handleSchedule} disabled={isPending || !scheduleDate}>
            Save
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setShowSchedule(false)}>
            Cancel
          </Button>
        </div>
      ) : null}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-zinc-500 hover:text-zinc-200 transition"
        >
          {expanded ? "Collapse" : "Expand"}
        </button>

        <CopyButton text={fullScript} />

        <button
          type="button"
          onClick={() => setShowSchedule((v) => !v)}
          className="text-xs text-zinc-500 hover:text-blue-400 transition"
        >
          Schedule
        </button>

        <div className="ml-auto flex gap-1">
          {STATUS_OPTIONS.filter((s) => s !== status).map((s) => (
            <button
              key={s}
              type="button"
              disabled={isPending}
              onClick={() => handleStatusChange(s)}
              className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400 transition hover:border-zinc-500 disabled:opacity-40"
            >
              → {s}
            </button>
          ))}
        </div>

        <form action={deleteAction}>
          <input type="hidden" name="script_id" value={script.id} />
          <button
            type="submit"
            className="text-xs text-zinc-600 transition hover:text-rose-400"
          >
            Delete
          </button>
        </form>
      </div>
    </article>
  );
}

export function ScriptsList({ scripts, deleteAction, updateStatusAction, scheduleAction }: ScriptsListProps) {
  const [filter, setFilter] = useState<"all" | "draft" | "ready" | "published">("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const byStatus = filter === "all" ? scripts : scripts.filter((s) => s.status === filter);
    const q = query.trim().toLowerCase();
    if (!q) return byStatus;
    return byStatus.filter((s) =>
      [s.hook, s.body, s.cta, s.viral_pattern, s.platform]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q))
    );
  }, [scripts, filter, query]);

  return (
    <div className="space-y-4">
      {/* History header: status tabs + search across everything generated */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-2">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-sm font-medium text-zinc-300">
            <History className="h-4 w-4 text-[#F9E400]" />
            History
          </span>
          <div className="flex gap-2">
            {FILTER_OPTIONS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`text-sm capitalize transition ${
                  filter === f ? "text-[#F9E400]" : "text-zinc-500 hover:text-zinc-200"
                }`}
              >
                {f} ({f === "all" ? scripts.length : scripts.filter((s) => s.status === f).length})
              </button>
            ))}
          </div>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search scripts…"
            className="h-8 w-48 rounded-lg border border-[#262626] bg-[#141414] pl-8 pr-2 text-sm text-zinc-200 placeholder:text-zinc-500 outline-none transition focus:border-[#F9E400]/60"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-700 bg-[#101010] p-5 text-sm text-zinc-400">
          {query
            ? `No scripts match “${query}”.`
            : filter === "all"
              ? "No scripts yet. Generate one above or from the Feed page."
              : `No ${filter} scripts.`}
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((script) => (
            <ScriptCard
              key={script.id}
              script={script}
              deleteAction={deleteAction}
              updateStatusAction={updateStatusAction}
              scheduleAction={scheduleAction}
            />
          ))}
        </div>
      )}
    </div>
  );
}
