"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  UserSearch,
  Clapperboard,
  Radar,
  Bookmark,
  ScrollText,
  Camera,
  MessageCircleReply,
  Calendar,
  Send,
  Plug,
  CreditCard,
  Settings,
  ShieldAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Logo } from "@/components/brand/Logo";
import { SignOutButton } from "@/components/layout/SignOutButton";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import type { SidebarUser } from "@/lib/user/sidebar-user";
import type { Dict } from "@/lib/i18n/dictionaries";
import { useDict } from "@/lib/i18n/I18nProvider";
import { fallbackPlanName } from "@/lib/i18n/plan-copy";
import type { DashboardPageId, PagesFlag } from "@/lib/dashboard/pages";

type NavKey = keyof Dict["nav"];
type NavLink = {
  href: string;
  labelKey: NavKey;
  icon: LucideIcon;
  matchPrefixes?: string[];
  /** data-tour hook for the product tour (components/tour/AppTour.tsx). */
  tourKey?: string;
  /** Admin's flag:pages id (lib/dashboard/pages.ts). Absent = never hidden. */
  pageId?: DashboardPageId;
};

const links: NavLink[] = [
  { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard, tourKey: "nav-dashboard" },
  { href: "/dashboard/accounts", labelKey: "accounts", icon: UserSearch, tourKey: "nav-accounts", pageId: "accounts" },
  { href: "/dashboard/feed", labelKey: "feed", icon: Clapperboard, tourKey: "nav-feed", pageId: "feed" },
  { href: "/dashboard/trends", labelKey: "trends", icon: Radar, tourKey: "nav-trends", pageId: "trends" },
  { href: "/dashboard/hooks", labelKey: "hooks", icon: Bookmark, tourKey: "nav-hooks", pageId: "hooks" },
  {
    href: "/dashboard/scripts",
    labelKey: "scripts",
    icon: ScrollText,
    // /dashboard/generate/[reel_id] is the script-generation page for a reel —
    // part of the Scripts section even though it lives outside /dashboard/scripts.
    matchPrefixes: ["/dashboard/generate"],
    tourKey: "nav-scripts",
    pageId: "scripts",
  },
  { href: "/dashboard/my-account", labelKey: "myIg", icon: Camera, tourKey: "nav-my-account", pageId: "myIg" },
  { href: "/dashboard/automations", labelKey: "autoReply", icon: MessageCircleReply, tourKey: "nav-automations", pageId: "autoReply" },
  { href: "/dashboard/publishing", labelKey: "publishing", icon: Send, tourKey: "nav-publishing", pageId: "publishing" },
  { href: "/dashboard/calendar", labelKey: "calendar", icon: Calendar, tourKey: "nav-calendar", pageId: "calendar" },
  { href: "/dashboard/connections", labelKey: "connections", icon: Plug, tourKey: "nav-connections", pageId: "connections" },
  { href: "/dashboard/billing", labelKey: "billing", icon: CreditCard, tourKey: "nav-billing", pageId: "billing" },
  { href: "/dashboard/settings", labelKey: "settings", icon: Settings, tourKey: "nav-settings", pageId: "settings" },
];

function isActive(pathname: string, link: NavLink): boolean {
  if (link.href === "/dashboard") return pathname === "/dashboard";
  if (pathname === link.href || pathname.startsWith(`${link.href}/`)) return true;
  return (link.matchPrefixes ?? []).some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

type SidebarProps = {
  open: boolean;
  onClose: () => void;
  user: SidebarUser | null;
  /** Product version the user is running (lib/release/). */
  version: string;
  /** There's a release they haven't caught up on — shows the dot. */
  hasUnseenRelease: boolean;
  /** Admin's flag:pages switch — which sections to show (lib/dashboard/pages-flag.ts). */
  pagesFlag: PagesFlag;
};

export function Sidebar({ open, onClose, user, version, hasUnseenRelease, pagesFlag }: SidebarProps) {
  const pathname = usePathname();
  const dict = useDict();
  const visibleLinks = links.filter((link) => !link.pageId || pagesFlag[link.pageId] !== false);

  return (
    <>
      {/* Mobile backdrop */}
      {open ? (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      ) : null}

      <aside
        className={`fixed start-0 top-0 z-40 flex h-dvh w-[240px] flex-col border-e border-border bg-background p-5 transition-transform duration-200 lg:translate-x-0 ${
          // Off-canvas slide is mobile-only (max-lg:) so it never competes with
          // the `lg:translate-x-0` desktop rule. Without max-lg, `rtl:` classes
          // carry a `[dir="rtl"]` attribute selector, which out-specifies plain
          // `lg:` classes and pushed the sidebar off-screen on desktop in RTL.
          open ? "translate-x-0" : "max-lg:-translate-x-full max-lg:rtl:translate-x-full"
        }`}
      >
        <div className="mb-8 flex items-center justify-between px-2">
          <Link href="/dashboard" onClick={onClose}>
            <Logo size={32} ariaLabel={dict.shell.logoAlt} />
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label={dict.shell.closeMenu}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex flex-col gap-1 overflow-y-auto">
          {visibleLinks.map((link) => {
            const active = isActive(pathname, link);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={onClose}
                data-tour={link.tourKey}
                className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition lg:py-2 ${
                  active
                    ? "bg-accent-brand/12 text-accent-brand"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                {active ? (
                  <span className="absolute start-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-accent-brand" />
                ) : null}
                <Icon className="h-[18px] w-[18px] transition-transform duration-200 group-hover:scale-110" />
                {dict.nav[link.labelKey]}
              </Link>
            );
          })}

          {/* Founder-only entry into the admin control panel (own route segment
              outside /dashboard). Rendered only when the profile is is_admin. */}
          {user?.isAdmin ? (
            <Link
              href="/admin"
              onClick={onClose}
              className="group relative mt-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-warning transition hover:bg-warning/10 lg:py-2"
            >
              <ShieldAlert className="h-[18px] w-[18px] transition-transform duration-200 group-hover:scale-110" />
              {dict.nav.admin}
            </Link>
          ) : null}
        </nav>

        <div className="mt-auto space-y-3 border-t border-border pt-4">
          {user ? (
            <Link
              href="/dashboard/billing"
              onClick={onClose}
              className="flex items-center justify-between rounded-lg bg-secondary/60 px-3 py-2 text-xs transition hover:bg-secondary"
            >
              <span className="text-muted-foreground">{dict.shell.plan}</span>
              <span
                className={`font-medium ${
                  user.tier === "free" ? "text-foreground" : "text-brand"
                }`}
              >
                {fallbackPlanName(dict, user.tier)}
              </span>
            </Link>
          ) : null}

          <ThemeToggle />

          {user ? (
            <Link
              href="/dashboard/my-account"
              onClick={onClose}
              className="flex items-center gap-3 rounded-lg p-2 transition hover:bg-secondary"
            >
              <Avatar
                src={user.avatarUrl}
                name={user.handle}
                className="h-9 w-9 shrink-0 text-xs"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {user.handle}
                </span>
                <span
                  className={`block text-xs ${
                    user.connected ? "text-success" : "text-muted-foreground"
                  }`}
                >
                  {user.connected ? dict.shell.connected : dict.shell.notConnected}
                </span>
              </span>
            </Link>
          ) : null}

          <SignOutButton />

          {/* Version pill — the one place in the product that answers "what am
              I running?", and the way into the release history. The dot is the
              only nag: it appears once per release and clears on first visit. */}
          <Link
            href="/dashboard/whats-new"
            onClick={onClose}
            aria-label={dict.release.versionLabel(version)}
            className={`flex items-center justify-center gap-2 rounded-lg px-3 py-1.5 font-mono text-[0.7rem] transition hover:bg-secondary ${
              pathname === "/dashboard/whats-new"
                ? "text-accent-brand"
                : "text-subtle hover:text-muted-foreground"
            }`}
          >
            {dict.release.versionShort(version)}
            {hasUnseenRelease ? (
              <span
                title={dict.release.unseenBadge}
                className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent-brand"
              />
            ) : null}
          </Link>
        </div>
      </aside>
    </>
  );
}
