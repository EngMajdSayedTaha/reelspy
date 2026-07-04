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
  AtSign,
  X,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { SignOutButton } from "@/components/layout/SignOutButton";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { planFor } from "@/lib/billing/plans";
import type { SidebarUser } from "@/lib/user/sidebar-user";
import type { Dict } from "@/lib/i18n/dictionaries";

type NavKey = keyof Dict["nav"];
type NavLink = { href: string; labelKey: NavKey; icon: LucideIcon; matchPrefixes?: string[] };

const links: NavLink[] = [
  { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard },
  { href: "/dashboard/accounts", labelKey: "accounts", icon: UserSearch },
  { href: "/dashboard/feed", labelKey: "feed", icon: Clapperboard },
  { href: "/dashboard/trends", labelKey: "trends", icon: Radar },
  { href: "/dashboard/hooks", labelKey: "hooks", icon: Bookmark },
  {
    href: "/dashboard/scripts",
    labelKey: "scripts",
    icon: ScrollText,
    // /dashboard/generate/[reel_id] is the script-generation page for a reel —
    // part of the Scripts section even though it lives outside /dashboard/scripts.
    matchPrefixes: ["/dashboard/generate"],
  },
  { href: "/dashboard/my-account", labelKey: "myIg", icon: Camera },
  { href: "/dashboard/automations", labelKey: "autoReply", icon: MessageCircleReply },
  { href: "/dashboard/publishing", labelKey: "publishing", icon: Send },
  { href: "/dashboard/calendar", labelKey: "calendar", icon: Calendar },
  { href: "/dashboard/connections", labelKey: "connections", icon: Plug },
  { href: "/dashboard/billing", labelKey: "billing", icon: CreditCard },
  { href: "/dashboard/settings", labelKey: "settings", icon: Settings },
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
  dict: Dict;
};

export function Sidebar({ open, onClose, user, dict }: SidebarProps) {
  const pathname = usePathname();

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
        className={`fixed start-0 top-0 z-40 flex h-screen w-[240px] flex-col border-e border-border bg-background p-5 transition-transform duration-200 lg:translate-x-0 ${
          // Hidden drawer slides toward the start edge — left in LTR, right in
          // RTL (rtl: flips the sign so it tucks off the correct side).
          open ? "translate-x-0" : "-translate-x-full rtl:translate-x-full"
        }`}
      >
        <div className="mb-8 flex items-center justify-between px-2">
          <Link href="/dashboard" onClick={onClose}>
            <Logo size={32} />
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
          {links.map((link) => {
            const active = isActive(pathname, link);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={onClose}
                className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition lg:py-2 ${
                  active
                    ? "bg-primary/10 text-brand"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                {active ? (
                  <span className="absolute start-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
                ) : null}
                <Icon className="h-[18px] w-[18px] transition-transform duration-200 group-hover:scale-110" />
                {dict.nav[link.labelKey]}
              </Link>
            );
          })}
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
                {planFor(user.tier).name}
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
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatarUrl}
                  alt={user.handle}
                  referrerPolicy="no-referrer"
                  className="h-9 w-9 shrink-0 rounded-full object-cover ring-2 ring-primary/40"
                />
              ) : (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary ring-1 ring-border-strong">
                  <AtSign className="h-4 w-4 text-muted-foreground" />
                </span>
              )}
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
        </div>
      </aside>
    </>
  );
}
