import Link from "next/link";
import { SignOutButton } from "@/components/layout/SignOutButton";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/accounts", label: "Accounts" },
  { href: "/dashboard/feed", label: "Feed" },
  { href: "/dashboard/scripts", label: "Scripts" },
  { href: "/dashboard/my-account", label: "My IG" },
  { href: "/dashboard/calendar", label: "Calendar" },
  { href: "/dashboard/settings/instagram", label: "Settings" },
];

export function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 flex h-screen w-[240px] flex-col border-r border-[#1f1f1f] bg-[#111111] p-6">
      <div className="mb-8 text-2xl font-semibold tracking-tight text-[#F9E400]">ReelSpy</div>
      <nav className="flex flex-col gap-2">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-md px-3 py-2 text-sm text-zinc-200 transition hover:bg-[#1f1f1f]"
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto border-t border-[#1f1f1f] pt-4">
        <SignOutButton />
      </div>
    </aside>
  );
}
