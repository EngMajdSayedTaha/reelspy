"use client";

import { usePathname } from "next/navigation";

const TITLES: { match: (p: string) => boolean; label: string }[] = [
  { match: (p) => p === "/dashboard", label: "Dashboard" },
  { match: (p) => p.startsWith("/dashboard/accounts"), label: "Inspiration Accounts" },
  { match: (p) => p.startsWith("/dashboard/feed"), label: "Feed" },
  { match: (p) => p.startsWith("/dashboard/generate"), label: "Script Generator" },
  { match: (p) => p.startsWith("/dashboard/scripts"), label: "Scripts Library" },
  { match: (p) => p.startsWith("/dashboard/my-account"), label: "My Instagram" },
  { match: (p) => p.startsWith("/dashboard/calendar"), label: "Content Calendar" },
  { match: (p) => p.startsWith("/dashboard/settings"), label: "Settings" },
];

export function TopBar() {
  const pathname = usePathname();
  const current = TITLES.find((t) => t.match(pathname))?.label ?? "ReelSpy";

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[#1f1f1f] bg-[#0d0d0d]/80 px-8 py-3.5 backdrop-blur">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-mono text-zinc-600">~/reelspy</span>
        <span className="text-zinc-700">/</span>
        <span className="font-medium text-zinc-200">{current}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-[#F9E400]" />
        <span className="font-mono text-xs text-zinc-500">command center</span>
      </div>
    </header>
  );
}
