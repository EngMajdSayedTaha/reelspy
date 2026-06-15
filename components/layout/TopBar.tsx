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
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/80 px-4 py-3.5 backdrop-blur sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <button
          type="button"
          onClick={onMenu}
          aria-label="Open menu"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="hidden font-mono text-subtle sm:inline">~/reelspy</span>
        <span className="hidden text-subtle sm:inline">/</span>
        <span className="truncate font-medium text-foreground">{current}</span>
      </div>
      <div className="flex min-w-0 items-center gap-3">
        {/* Global Instagram sync budget — visible on every page. */}
        <RateLimitStatus />
        <span className="hidden h-2 w-2 animate-pulse rounded-full bg-primary sm:inline" />
      </div>
    </header>
  );
}
