"use client";

import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { RateLimitStatus } from "@/components/reels/RateLimitStatus";
import { LanguageSwitch } from "@/components/layout/LanguageSwitch";
import type { Dict } from "@/lib/i18n/dictionaries";
import { useDict, useLocale } from "@/lib/i18n/I18nProvider";

type TitleKey = keyof Dict["titles"];

const TITLES: { match: (p: string) => boolean; key: TitleKey }[] = [
  { match: (p) => p === "/dashboard", key: "dashboard" },
  { match: (p) => p.startsWith("/dashboard/accounts"), key: "accounts" },
  { match: (p) => p.startsWith("/dashboard/feed"), key: "feed" },
  { match: (p) => p.startsWith("/dashboard/trends"), key: "trends" },
  { match: (p) => p.startsWith("/dashboard/hooks"), key: "hooks" },
  { match: (p) => p.startsWith("/dashboard/generate"), key: "generate" },
  { match: (p) => p.startsWith("/dashboard/scripts"), key: "scripts" },
  { match: (p) => p.startsWith("/dashboard/my-account"), key: "myAccount" },
  { match: (p) => p.startsWith("/dashboard/publishing"), key: "publishing" },
  { match: (p) => p.startsWith("/dashboard/calendar"), key: "calendar" },
  { match: (p) => p.startsWith("/dashboard/connections"), key: "connections" },
  { match: (p) => p.startsWith("/dashboard/billing"), key: "billing" },
  { match: (p) => p.startsWith("/dashboard/settings"), key: "settings" },
];

type TopBarProps = {
  onMenu: () => void;
};

export function TopBar({ onMenu }: TopBarProps) {
  const pathname = usePathname();
  const dict = useDict();
  const locale = useLocale();
  const titleKey = TITLES.find((t) => t.match(pathname))?.key;
  const current = titleKey ? dict.titles[titleKey] : dict.shell.appName;

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/80 px-4 py-3.5 backdrop-blur sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <button
          type="button"
          onClick={onMenu}
          aria-label={dict.shell.openMenu}
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
        <LanguageSwitch locale={locale} label={dict.shell.switchLanguage} />
        <span className="hidden h-2 w-2 animate-pulse rounded-full bg-primary sm:inline" />
      </div>
    </header>
  );
}
