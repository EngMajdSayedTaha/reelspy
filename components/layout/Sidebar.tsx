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
  Calendar,
  Settings,
  X,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { SignOutButton } from "@/components/layout/SignOutButton";

type NavLink = { href: string; label: string; icon: LucideIcon };

const links: NavLink[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/accounts", label: "Accounts", icon: UserSearch },
  { href: "/dashboard/feed", label: "Feed", icon: Clapperboard },
  { href: "/dashboard/hooks", label: "Hooks", icon: Quote },
  { href: "/dashboard/scripts", label: "Scripts", icon: ScrollText },
  { href: "/dashboard/my-account", label: "My IG", icon: Camera },
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
};

export function Sidebar({ open, onClose }: SidebarProps) {
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
        className={`fixed left-0 top-0 z-40 flex h-screen w-[240px] flex-col border-r border-[#1f1f1f] bg-[#0f0f0f] p-5 transition-transform duration-200 lg:translate-x-0 ${
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
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-[#1a1a1a] hover:text-zinc-100 lg:hidden"
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
                    ? "bg-[#F9E400]/10 text-[#F9E400]"
                    : "text-zinc-400 hover:bg-[#1a1a1a] hover:text-zinc-100"
                }`}
              >
                {active ? (
                  <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-[#F9E400]" />
                ) : null}
                <Icon className="h-[18px] w-[18px] transition-transform duration-200 group-hover:scale-110" />
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-[#1f1f1f] pt-4">
          <SignOutButton />
        </div>
      </aside>
    </>
  );
}
