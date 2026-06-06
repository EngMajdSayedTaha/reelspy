"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Copy, ExternalLink, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { HookItem } from "@/app/dashboard/hooks/page";

type HooksExplorerProps = {
  hooks: HookItem[];
};

function HookRow({ item }: { item: HookItem }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(item.hook);
      setCopied(true);
      toast.success("Hook copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy");
    }
  };

  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-[#1f1f1f] bg-[#111111] p-4">
      <div className="min-w-0 space-y-1.5">
        <p className="text-sm leading-relaxed text-zinc-100">{item.hook}</p>
        <p className="text-xs text-zinc-500">@{item.username}</p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={copy}
          title="Copy hook"
          aria-label="Copy hook"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#262626] bg-[#141414] text-zinc-300 transition hover:border-[#F9E400]/60 hover:text-[#F9E400]"
        >
          {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
        </button>
        <Link
          href={`/dashboard/generate/${item.reelId}`}
          title="Write a script from this"
          aria-label="Write a script from this"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#262626] bg-[#141414] text-zinc-300 transition hover:border-[#F9E400]/60 hover:text-[#F9E400]"
        >
          <Sparkles className="h-4 w-4" />
        </Link>
        <a
          href={item.permalink}
          target="_blank"
          rel="noreferrer"
          title="Open original reel"
          aria-label="Open original reel"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#262626] bg-[#141414] text-zinc-300 transition hover:border-[#F9E400]/60 hover:text-[#F9E400]"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}

export function HooksExplorer({ hooks }: HooksExplorerProps) {
  const [query, setQuery] = useState("");

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
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search hooks…"
          className="h-10 w-full rounded-lg border border-[#262626] bg-[#141414] pl-9 pr-3 text-sm text-zinc-200 placeholder:text-zinc-500 outline-none transition focus:border-[#F9E400]/60 focus:ring-2 focus:ring-[#F9E400]/20"
        />
      </div>

      <p className="px-1 text-xs text-zinc-500">
        {filtered.length} {filtered.length === 1 ? "hook" : "hooks"}
        {query ? " match your search" : ""}
      </p>

      <div className="grid gap-3">
        {filtered.map((item) => (
          <HookRow key={item.reelId} item={item} />
        ))}
      </div>
    </div>
  );
}
