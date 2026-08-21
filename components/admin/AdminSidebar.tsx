"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Tags,
  FolderOpen,
  Wrench,
  BarChart3,
  ScrollText,
  ArrowLeft,
  ClipboardList,
  BellRing,
  X,
  type LucideIcon,
} from "lucide-react";

// Admin nav is hardcoded English (the admin area is not localized — see the
// plan). Structural pattern mirrors components/layout/Sidebar.tsx.
type NavLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Exact-match only (the Overview root), else prefix match. */
  exact?: boolean;
};

const links: NavLink[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/waitlist", label: "Waiting list", icon: ClipboardList },
  { href: "/admin/billing", label: "Billing", icon: CreditCard },
  { href: "/admin/plans", label: "Plans & pricing", icon: Tags },
  { href: "/admin/content", label: "Content", icon: FolderOpen },
  { href: "/admin/ops", label: "Operations", icon: Wrench },
  { href: "/admin/notifications", label: "Notifications", icon: BellRing },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText },
];

function isActive(pathname: string, link: NavLink): boolean {
  if (link.exact) return pathname === link.href;
  return pathname === link.href || pathname.startsWith(`${link.href}/`);
}

export function AdminSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const unread = useUnreadAlerts(pathname);

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      ) : null}

      <aside
        className={`fixed start-0 top-0 z-40 flex h-dvh w-[240px] flex-col border-e border-border bg-background p-5 transition-transform duration-200 lg:translate-x-0 ${
          open ? "translate-x-0" : "max-lg:-translate-x-full"
        }`}
      >
        <div className="mb-8 flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold tracking-tight text-foreground">ReelSpy</span>
            <span className="rounded-md bg-warning/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warning">
              Admin
            </span>
          </div>
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
            const active = isActive(pathname, link);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={onClose}
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
                {link.label}
                {link.href === "/admin/notifications" && unread > 0 ? (
                  <span className="ms-auto rounded-full bg-accent-brand/20 px-1.5 py-0.5 text-[10px] font-bold text-accent-brand">
                    {unread > 99 ? "99+" : unread}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-border pt-4">
          <Link
            href="/dashboard"
            onClick={onClose}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            <ArrowLeft className="h-[18px] w-[18px]" />
            Back to app
          </Link>
        </div>
      </aside>
    </>
  );
}

// The unread badge. Re-read on every admin navigation rather than polled on a
// timer: an admin who is clicking around gets a fresh number for free, and one
// sitting still on a page isn't waiting on this. Silent on failure — a missing
// badge must never be the thing that breaks the admin chrome.
function useUnreadAlerts(pathname: string): number {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/notifications/alerts?counts=1");
        if (!res.ok) return;
        const body = (await res.json()) as { counts?: { unread?: number } };
        if (!cancelled) setUnread(body.counts?.unread ?? 0);
      } catch {
        // Keep the last number we had.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return unread;
}
