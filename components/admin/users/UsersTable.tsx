"use client";

import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { Badge } from "@/components/ui/badge";
import type { AdminUserRow } from "@/app/api/admin/users/route";

function tierVariant(tier: string): "default" | "secondary" | "outline" {
  if (tier === "free" || tier === "inactive") return "outline";
  return "default";
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const columns: Column<AdminUserRow>[] = [
  {
    key: "email",
    header: "Email",
    render: (r) => (
      <Link href={`/admin/users/${r.id}`} className="font-medium text-foreground hover:text-brand hover:underline">
        {r.email ?? <span className="text-muted-foreground">no email</span>}
      </Link>
    ),
  },
  {
    key: "username",
    header: "Username",
    sortable: true,
    render: (r) => <span className="text-muted-foreground">{r.username ?? "—"}</span>,
  },
  {
    key: "tier",
    header: "Tier",
    render: (r) => <Badge variant={tierVariant(r.tier)}>{r.tier}</Badge>,
  },
  {
    key: "status",
    header: "Status",
    render: (r) => (
      <span className={r.status === "active" ? "text-success" : "text-muted-foreground"}>
        {r.status}
      </span>
    ),
  },
  {
    key: "created_at",
    header: "Signup",
    sortable: true,
    render: (r) => <span className="text-muted-foreground">{fmtDate(r.createdAt)}</span>,
  },
  {
    key: "admin",
    header: "",
    render: (r) =>
      r.isAdmin ? (
        <Badge variant="secondary" className="gap-1">
          <ShieldAlert className="h-3 w-3" /> admin
        </Badge>
      ) : null,
  },
];

export function UsersTable() {
  return (
    <DataTable<AdminUserRow>
      endpoint="/api/admin/users"
      columns={columns}
      rowKey={(r) => r.id}
      searchPlaceholder="Search username, email, or cus_…"
      emptyMessage="No users match."
    />
  );
}
