"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  UserSearch,
  Clapperboard,
  ScrollText,
  Quote,
  Camera,
  MessageCircleReply,
  Calendar,
  Settings,
  AtSign,
  X,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { SignOutButton } from "@/components/layout/SignOutButton";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import type { SidebarUser } from "@/lib/user/sidebar-user";

type NavLink = { href: string; label: string; icon: LucideIcon };

const links: NavLink[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/accounts", label: "Accounts", icon: UserSearch },
  { href: "/dashboard/feed", label: "Feed", icon: Clapperboard },
  { href: "/dashboard/hooks", label: "Hooks", icon: Quote },
  { href: "/dashboard/scripts", label: "Scripts", icon: ScrollText },
  { href: "/dashboard/my-account", label: "My IG", icon: Camera },
  { href: "/dashboard/automations", label: "Auto-Reply", icon: MessageCircleReply },
  { href: "/dashboard/calendar", label: "Calendar", icon: Calendar },
  { href: "/dashboard/settings/instagram", label: "Settings", icon: Settings },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

type SidebarProps = {
  open: boolean;
  onClose: () => void;
  user: SidebarUser | null;
};

export function Sidebar({ open, onClose, user }: SidebarProps) {
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
        className={`fixed left-0 top-0 z-40 flex h-screen w-[240px] flex-col border-r border-border bg-background p-5 transition-transform duration-200 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-8 flex items-center justify-between px-2">
          <Link href="/dashboard" onClick={onClose}>
            <Logo size={32} />
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex flex-col gap-1 overflow-y-auto">
          {links.map((link) => {
            const active = isActive(pathname, link.href);
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
                  <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
                ) : null}
                <Icon className="h-[18px] w-[18px] transition-transform duration-200 group-hover:scale-110" />
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto space-y-3 border-t border-border pt-4">
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
                    user.connected ? "text-emerald-500" : "text-muted-foreground"
                  }`}
                >
                  {user.connected ? "Connected" : "Not connected"}
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
