"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { BookmarkPlus, Check, Copy, ExternalLink, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { saveHook } from "@/app/dashboard/hooks/actions";
import type { HookItem } from "@/app/dashboard/hooks/page";
import { useDict } from "@/lib/i18n/I18nProvider";

type HooksExplorerProps = {
  hooks: HookItem[];
  // Texts already in the saved library, so we can mark suggestions as saved.
  savedTexts: string[];
};

function HookRow({ item, initiallySaved }: { item: HookItem; initiallySaved: boolean }) {
  const dict = useDict().hooks.explorer;
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(initiallySaved);
  const [pending, startTransition] = useTransition();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(item.hook);
      setCopied(true);
      toast.success(dict.copiedToast);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(dict.copyError);
    }
  };

  const save = () => {
    if (saved) return;
    setSaved(true);
    startTransition(async () => {
      try {
        await saveHook({ text: item.hook, reelId: item.reelId, source: "transcript" });
        toast.success(dict.savedToast);
      } catch {
        setSaved(false);
        toast.error(dict.saveError);
      }
    });
  };

  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card p-4">
      <div className="min-w-0 space-y-1.5">
        <p className="text-sm leading-relaxed text-foreground">{item.hook}</p>
        <p className="text-xs text-subtle">@{item.username}</p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={save}
          disabled={saved || pending}
          title={saved ? dict.savedTitle : dict.saveTitle}
          aria-label={saved ? dict.savedTitle : dict.saveTitle}
          className={`flex h-8 w-8 items-center justify-center rounded-lg border transition ${
            saved
              ? "border-success/40 bg-success/10 text-success"
              : "border-border-strong bg-surface-2 text-muted-foreground hover:border-primary/60 hover:text-brand"
          } disabled:opacity-100`}
        >
          {saved ? <Check className="h-4 w-4" /> : <BookmarkPlus className="h-4 w-4" />}
        </button>
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
          href={`/dashboard/generate/${item.reelId}`}
          title={dict.writeScriptTitle}
          aria-label={dict.writeScriptAria}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border-strong bg-surface-2 text-muted-foreground transition hover:border-primary/60 hover:text-brand"
        >
          <Sparkles className="h-4 w-4" />
        </Link>
        <a
          href={item.permalink}
          target="_blank"
          rel="noreferrer"
          title={dict.openReelTitle}
          aria-label={dict.openReelAria}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border-strong bg-surface-2 text-muted-foreground transition hover:border-primary/60 hover:text-brand"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}

export function HooksExplorer({ hooks, savedTexts }: HooksExplorerProps) {
  const dict = useDict().hooks.explorer;
  const [query, setQuery] = useState("");
  const savedSet = useMemo(() => new Set(savedTexts), [savedTexts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return hooks;
    return hooks.filter(
      (h) => h.hook.toLowerCase().includes(q) || h.username.toLowerCase().includes(q)
    );
  }, [hooks, query]);

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

      <p className="px-1 text-xs text-subtle">
        {dict.count(filtered.length)}
        {query ? dict.matchesSearchSuffix : ""}
      </p>

      <div className="stagger grid gap-3">
        {filtered.map((item) => (
          <HookRow key={item.reelId} item={item} initiallySaved={savedSet.has(item.hook)} />
        ))}
      </div>
    </div>
  );
}
