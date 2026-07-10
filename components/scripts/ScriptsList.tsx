"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ExternalLink, History, Search, Film } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useDict, useLocale } from "@/lib/i18n/I18nProvider";
import { intlLocale } from "@/lib/i18n/intl";
import { useRetryableImage } from "@/lib/hooks/useRetryableImage";

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
  draft: "border-border-strong text-muted-foreground",
  ready: "border-info/50 text-info",
  published: "border-success/50 text-success",
};

const FILTER_OPTIONS = ["all", "draft", "ready", "published"] as const;

function CopyButton({ text }: { text: string }) {
  const dict = useDict();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="text-xs text-subtle transition hover:text-brand"
    >
      {copied ? dict.scripts.copied : dict.scripts.copy}
    </button>
  );
}

function ScriptCard({
  script,
  deleteAction,
  updateStatusAction,
  scheduleAction,
  highlight,
}: {
  script: ScriptRow;
  deleteAction: (formData: FormData) => Promise<void>;
  updateStatusAction: (id: string, status: "draft" | "ready" | "published") => Promise<void>;
  scheduleAction: (id: string, date: string) => Promise<void>;
  highlight?: boolean;
}) {
  const dict = useDict();
  const locale = useLocale();
  const s = dict.scripts;
  const confirm = useConfirm();
  const [expanded, setExpanded] = useState(Boolean(highlight));
  const [isPending, startTransition] = useTransition();
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(script.scheduled_date ?? "");
  const sourceReel = sourceReelOf(script);
  const sourceAccount = sourceReel ? sourceAccountOf(sourceReel) : null;
  const thumb = useRetryableImage(sourceReel?.thumbnail_url);

  const status = (script.status ?? "draft") as "draft" | "ready" | "published";
  const fullScript = `[HOOK]\n${script.hook ?? ""}\n\n[BODY]\n${script.body ?? ""}\n\n[CTA]\n${script.cta ?? ""}`;

  const handleStatusChange = (newStatus: "draft" | "ready" | "published") => {
    startTransition(async () => {
      try {
        await updateStatusAction(script.id, newStatus);
        toast.success(s.movedTo(s.statuses[newStatus]));
      } catch {
        toast.error(s.couldNotUpdateStatus);
      }
    });
  };

  const handleSchedule = () => {
    if (!scheduleDate) return;
    startTransition(async () => {
      try {
        await scheduleAction(script.id, scheduleDate);
        setShowSchedule(false);
        toast.success(s.scheduledFor(scheduleDate));
      } catch {
        toast.error(s.couldNotSchedule);
      }
    });
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: s.deleteTitle,
      description: s.deleteDescription,
      confirmText: dict.common.delete,
      destructive: true,
    });
    if (!ok) return;

    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("script_id", script.id);
        await deleteAction(formData);
        toast.success(s.scriptDeleted);
      } catch {
        toast.error(s.couldNotDelete);
      }
    });
  };

  return (
    <article
      id={`script-${script.id}`}
      className={`space-y-3 rounded-xl border bg-card p-4 transition ${
        highlight ? "border-primary ring-1 ring-primary/50" : "border-border"
      }`}
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_COLORS[status] ?? STATUS_COLORS.draft}`}
          >
            {s.statuses[status]}
          </span>
          {script.platform ? (
            <span className="text-xs text-subtle">{script.platform}</span>
          ) : null}
          {script.scheduled_date ? (
            <span className="text-xs text-info">{s.scheduledOn(script.scheduled_date)}</span>
          ) : null}
        </div>
        <p className="text-xs text-subtle">
          {new Date(script.created_at).toLocaleDateString(intlLocale(locale), {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </p>
      </div>

      {/* Source reel this script was generated from */}
      {sourceReel ? (
        <div className="flex items-center gap-2.5 rounded-lg border border-border-strong bg-background p-2">
          {sourceReel.thumbnail_url && !thumb.failed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={thumb.retryKey}
              src={sourceReel.thumbnail_url}
              alt={s.sourceReelLabel}
              referrerPolicy="no-referrer"
              onError={thumb.onError}
              className="h-12 w-9 shrink-0 rounded-md object-cover"
            />
          ) : (
            <span className="flex h-12 w-9 shrink-0 items-center justify-center rounded-md bg-secondary">
              <Film className="h-4 w-4 text-subtle" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wide text-subtle">{s.sourceReelLabel}</p>
            <p className="truncate text-xs text-muted-foreground">
              {sourceAccount ? `@${sourceAccount.ig_username}` : s.trackedReel}
            </p>
          </div>
          <Link
            href={`/dashboard/generate/${sourceReel.id}`}
            className="shrink-0 text-xs text-brand underline-offset-4 hover:underline"
          >
            {s.open}
          </Link>
          <a
            href={sourceReel.ig_permalink}
            target="_blank"
            rel="noreferrer"
            title={s.openOnInstagram}
            aria-label={s.openOnInstagram}
            className="shrink-0 text-subtle transition hover:text-brand"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      ) : null}

      {/* Hook always visible */}
      <div>
        <p className="text-xs uppercase tracking-wide text-subtle">{s.hook}</p>
        <p className="mt-0.5 text-sm text-foreground">{script.hook}</p>
      </div>

      {/* Expandable body + cta */}
      {expanded ? (
        <>
          <div>
            <p className="text-xs uppercase tracking-wide text-subtle">{s.body}</p>
            <p className="mt-0.5 whitespace-pre-line text-sm text-foreground">{script.body}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-subtle">{s.cta}</p>
            <p className="mt-0.5 text-sm text-foreground">{script.cta}</p>
          </div>
        </>
      ) : null}

      {/* Schedule input */}
      {showSchedule ? (
        <div className="flex gap-2">
          <input
            type="date"
            aria-label={s.publishDateLabel}
            value={scheduleDate}
            onChange={(e) => setScheduleDate(e.target.value)}
            className="rounded-md border border-border-strong bg-background px-2 py-1 text-base md:text-sm text-foreground"
          />
          <Button type="button" size="sm" onClick={handleSchedule} disabled={isPending || !scheduleDate}>
            {dict.common.save}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setShowSchedule(false)}>
            {dict.common.cancel}
          </Button>
        </div>
      ) : null}

      {/* Actions */}
      <div data-tour="script-actions" className="flex flex-wrap items-center gap-2 border-t border-border-strong pt-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-subtle hover:text-foreground transition"
        >
          {expanded ? s.collapse : s.expand}
        </button>

        <CopyButton text={fullScript} />

        <button
          type="button"
          onClick={() => setShowSchedule((v) => !v)}
          className="text-xs text-subtle hover:text-info transition"
        >
          {s.schedule}
        </button>

        <div className="ms-auto flex gap-1">
          {STATUS_OPTIONS.filter((opt) => opt !== status).map((opt) => (
            <button
              key={opt}
              type="button"
              disabled={isPending}
              onClick={() => handleStatusChange(opt)}
              className="rounded border border-border-strong px-2 py-0.5 text-xs text-muted-foreground transition hover:border-border-strong disabled:opacity-40"
            >
              <span className="inline-block rtl:-scale-x-100">→</span> {s.statuses[opt]}
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={isPending}
          onClick={handleDelete}
          className="text-xs text-subtle transition hover:text-danger disabled:opacity-50"
        >
          {dict.common.delete}
        </button>
      </div>
    </article>
  );
}

export function ScriptsList({ scripts, deleteAction, updateStatusAction, scheduleAction }: ScriptsListProps) {
  const dict = useDict();
  const t = dict.scripts;
  const [filter, setFilter] = useState<"all" | "draft" | "ready" | "published">("all");
  const [query, setQuery] = useState("");
  // When opened from the calendar via /dashboard/scripts?script=<id>, highlight
  // and scroll to that script so the user lands directly on what they clicked.
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const scrolledRef = useRef(false);

  useEffect(() => {
    // Read after mount: the param only matters on the client, and reading it
    // during render would risk a hydration mismatch on the highlight styling.
    const id = new URLSearchParams(window.location.search).get("script");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (id) setHighlightId(id);
  }, []);

  useEffect(() => {
    if (!highlightId || scrolledRef.current) return;
    const el = document.getElementById(`script-${highlightId}`);
    if (el) {
      scrolledRef.current = true;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightId, scripts]);

  const filtered = useMemo(() => {
    const byStatus = filter === "all" ? scripts : scripts.filter((s) => s.status === filter);
    const q = query.trim().toLowerCase();
    if (!q) return byStatus;
    return byStatus.filter((s) =>
      [s.hook, s.body, s.cta, s.platform]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q))
    );
  }, [scripts, filter, query]);

  return (
    <div className="space-y-4">
      {/* History header: status tabs + search across everything generated */}
      <div
        data-tour="script-history"
        className="flex flex-wrap items-center justify-between gap-3 border-b border-border-strong pb-2"
      >
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <History className="h-4 w-4 text-brand" />
            {t.history}
          </span>
          <div className="flex gap-2">
            {FILTER_OPTIONS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`text-sm transition ${
                  filter === f ? "text-brand" : "text-subtle hover:text-foreground"
                }`}
              >
                {t.statuses[f]} ({f === "all" ? scripts.length : scripts.filter((s) => s.status === f).length})
              </button>
            ))}
          </div>
        </div>

        <div className="relative max-sm:w-full">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="h-8 w-full rounded-lg border border-border-strong bg-surface-2 ps-8 pe-2 text-base text-foreground placeholder:text-subtle outline-none transition focus:border-primary/60 sm:w-48 md:text-sm"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong bg-background p-5 text-sm text-muted-foreground">
          {query
            ? t.noScriptsMatch(query)
            : filter === "all"
              ? t.noScriptsYet
              : t.noStatusScripts(t.statuses[filter].toLowerCase())}
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
              highlight={highlightId === script.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
