"use client";

import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { RateLimitStatus } from "@/components/reels/RateLimitStatus";

const TITLES: { match: (p: string) => boolean; label: string }[] = [
  { match: (p) => p === "/dashboard", label: "Dashboard" },
  { match: (p) => p.startsWith("/dashboard/accounts"), label: "Inspiration Accounts" },
  { match: (p) => p.startsWith("/dashboard/feed"), label: "Feed" },
  { match: (p) => p.startsWith("/dashboard/hooks"), label: "Hook Library" },
  { match: (p) => p.startsWith("/dashboard/generate"), label: "Script Generator" },
  { match: (p) => p.startsWith("/dashboard/scripts"), label: "Scripts Library" },
  { match: (p) => p.startsWith("/dashboard/my-account"), label: "My Instagram" },
  { match: (p) => p.startsWith("/dashboard/calendar"), label: "Content Calendar" },
  { match: (p) => p.startsWith("/dashboard/settings"), label: "Settings" },
];

type TopBarProps = {
  onMenu: () => void;
};

export function TopBar({ onMenu }: TopBarProps) {
  const pathname = usePathname();
  const current = TITLES.find((t) => t.match(pathname))?.label ?? "ReelSpy";

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[#1f1f1f] bg-[#0d0d0d]/80 px-4 py-3.5 backdrop-blur sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <button
          type="button"
          onClick={onMenu}
          aria-label="Open menu"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-300 transition hover:bg-[#1a1a1a] hover:text-zinc-100 lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="hidden font-mono text-zinc-600 sm:inline">~/reelspy</span>
        <span className="hidden text-zinc-700 sm:inline">/</span>
        <span className="truncate font-medium text-zinc-200">{current}</span>
      </div>
      <div className="flex min-w-0 items-center gap-3">
        {/* Global Instagram sync budget — visible on every page. */}
        <RateLimitStatus />
        <span className="hidden h-2 w-2 animate-pulse rounded-full bg-[#F9E400] sm:inline" />
      </div>
    </header>
  );
}
