"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Check, Copy, ExternalLink, Search, Sparkles, Tag, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { deleteHook, setHookTags } from "@/app/dashboard/hooks/actions";
import { useDict } from "@/lib/i18n/I18nProvider";

export type SavedHook = {
  id: string;
  text: string;
  tags: string[];
  reelId: string | null;
  permalink: string | null;
  username: string | null;
};

function useInScriptHref(text: string): string {
  return `/dashboard/scripts?hook=${encodeURIComponent(text)}`;
}

function HookCard({ hook }: { hook: SavedHook }) {
  const dict = useDict().hooks.library;
  const [tags, setTags] = useState<string[]>(hook.tags);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(hook.text);
      setCopied(true);
      toast.success(dict.copiedToast);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(dict.copyError);
    }
  };

  const persistTags = (next: string[]) => {
    const previous = tags;
    setTags(next);
    startTransition(async () => {
      try {
        await setHookTags({ id: hook.id, tags: next });
      } catch {
        setTags(previous);
        toast.error(dict.tagsUpdateError);
      }
    });
  };

  const addTag = () => {
    const t = draft.trim().toLowerCase().replace(/\s+/g, "-");
    if (!t) return;
    if (!tags.includes(t)) persistTags([...tags, t]);
    setDraft("");
  };

  const removeTag = (t: string) => persistTags(tags.filter((x) => x !== t));

  const remove = () => {
    startTransition(async () => {
      try {
        await deleteHook(hook.id);
        toast.success(dict.removedToast);
      } catch {
        toast.error(dict.removeError);
      }
    });
  };

  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-sm leading-relaxed text-foreground">{hook.text}</p>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={copy}
            title={dict.copyTitle}
            aria-label={dict.copyAria}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border-strong bg-surface-2 text-muted-foreground transition hover:border-primary/60 hover:text-brand"
          >
            {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
          </button>
          <Link
            href={useInScriptHref(hook.text)}
            title={dict.useInScriptTitle}
            aria-label={dict.useInScriptAria}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border-strong bg-surface-2 text-muted-foreground transition hover:border-primary/60 hover:text-brand"
          >
            <Sparkles className="h-4 w-4" />
          </Link>
          {hook.permalink ? (
            <a
              href={hook.permalink}
              target="_blank"
              rel="noreferrer"
              title={dict.openReelTitle}
              aria-label={dict.openReelAria}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border-strong bg-surface-2 text-muted-foreground transition hover:border-primary/60 hover:text-brand"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          ) : null}
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            title={dict.removeTitle}
            aria-label={dict.removeAria}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border-strong bg-surface-2 text-muted-foreground transition hover:border-destructive/60 hover:text-destructive disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {hook.username ? (
          <span className="text-xs text-subtle">@{hook.username}</span>
        ) : null}
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-full border border-border-strong bg-surface-2 px-2 py-0.5 text-xs text-muted-foreground"
          >
            {t}
            <button
              type="button"
              onClick={() => removeTag(t)}
              aria-label={dict.removeTagAria(t)}
              className="text-subtle hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              addTag();
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              } else if (e.key === "Escape") {
                setDraft("");
                setEditing(false);
              }
            }}
            placeholder={dict.addTagPlaceholder}
            className="h-6 w-24 rounded-full border border-border-strong bg-surface-2 px-2 text-xs text-foreground outline-none focus:border-primary/60"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border-strong px-2 py-0.5 text-xs text-subtle transition hover:border-primary/60 hover:text-brand"
          >
            <Tag className="h-3 w-3" /> {dict.addTagButton}
          </button>
        )}
      </div>
    </div>
  );
}

export function SavedHooksLibrary({ hooks }: { hooks: SavedHook[] }) {
  const dict = useDict().hooks.library;
  const [query, setQuery] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const h of hooks) for (const t of h.tags) set.add(t);
    return [...set].sort();
  }, [hooks]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return hooks.filter((h) => {
      const matchesQuery =
        !q || h.text.toLowerCase().includes(q) || (h.username ?? "").toLowerCase().includes(q);
      // OR semantics: a hook matches if it carries any of the selected tags.
      const matchesTags = activeTags.length === 0 || activeTags.some((t) => h.tags.includes(t));
      return matchesQuery && matchesTags;
    });
  }, [hooks, query, activeTags]);

  const toggleTag = (t: string) =>
    setActiveTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  if (hooks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border-strong bg-background p-5 text-sm text-muted-foreground">
        {dict.emptyState}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={dict.searchPlaceholder}
          className="h-10 w-full rounded-lg border border-border-strong bg-surface-2 ps-9 pe-3 text-sm text-foreground placeholder:text-subtle outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {allTags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {allTags.map((t) => {
            const active = activeTags.includes(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleTag(t)}
                className={`rounded-full border px-2.5 py-0.5 text-xs transition ${
                  active
                    ? "border-primary bg-primary/10 text-brand"
                    : "border-border-strong text-muted-foreground hover:border-primary/50"
                }`}
              >
                {t}
              </button>
            );
          })}
          {activeTags.length > 0 ? (
            <button
              type="button"
              onClick={() => setActiveTags([])}
              className="rounded-full px-2 py-0.5 text-xs text-subtle underline-offset-2 hover:text-foreground hover:underline"
            >
              {dict.clearButton}
            </button>
          ) : null}
        </div>
      ) : null}

      <p className="px-1 text-xs text-subtle">
        {dict.count(filtered.length)}
      </p>

      <div className="grid gap-3">
        {filtered.map((h) => (
          <HookCard key={h.id} hook={h} />
        ))}
      </div>
    </div>
  );
}
