import Link from "next/link";
import { Users, CreditCard, Wrench, BarChart3 } from "lucide-react";

// Placeholder Overview — replaced with live stat cards in Phase 1b.
export default function AdminOverviewPage() {
  const cards = [
    { href: "/admin/users", label: "Users", icon: Users, desc: "Look up, edit, ban, delete" },
    { href: "/admin/billing", label: "Billing", icon: CreditCard, desc: "Subscriptions & Stripe" },
    { href: "/admin/ops", label: "Operations", icon: Wrench, desc: "Jobs, cron, cookies, settings" },
    { href: "/admin/analytics", label: "Analytics", icon: BarChart3, desc: "Funnels & retention" },
  ];
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Admin control panel. Live metrics land in Phase 1b.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.href}
              href={c.href}
              className="flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition hover:ring-primary/30"
            >
              <Icon className="h-5 w-5 text-brand" />
              <span className="text-sm font-semibold text-foreground">{c.label}</span>
              <span className="text-xs text-muted-foreground">{c.desc}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
