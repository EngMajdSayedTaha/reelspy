"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ShieldAlert, ShieldOff, ShieldCheck, Ban as BanIcon } from "lucide-react";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { requestJson, notifyError } from "@/lib/utils/api";
import type { AdminUserRow } from "@/app/api/admin/users/route";

function tierVariant(tier: string): "default" | "secondary" | "outline" {
  if (tier === "free" || tier === "inactive") return "outline";
  return "default";
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// Compact relative label for recent activity, falling back to an absolute
// date once it's more than a few weeks old (matching the Signup column).
function fmtLastActive(iso: string | null): string {
  if (!iso) return "Never";
  const diffDays = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays}d ago`;
  return fmtDate(iso);
}

function displayName(r: AdminUserRow): string {
  return r.email ?? r.username ?? "this user";
}

export function UsersTable() {
  const [busyId, setBusyId] = useState<string | null>(null);
  const refetchRef = useRef<() => void>(() => {});
  const confirm = useConfirm();

  const toggleBan = async (row: AdminUserRow) => {
    const next = !row.isBanned;
    if (next) {
      const ok = await confirm({
        title: `Ban ${displayName(row)}?`,
        description: "They won't be able to sign in or refresh their session until unbanned.",
        confirmText: "Ban user",
        destructive: true,
      });
      if (!ok) return;
    }
    setBusyId(row.id);
    try {
      await requestJson(`/api/admin/users/${row.id}/ban`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ banned: next }),
      });
      toast.success(next ? "User banned." : "User unbanned.");
      refetchRef.current();
    } catch (err) {
      notifyError(err);
    } finally {
      setBusyId(null);
    }
  };

  const toggleAdmin = async (row: AdminUserRow) => {
    const next = !row.isAdmin;
    const ok = await confirm({
      title: next ? `Grant admin access to ${displayName(row)}?` : `Revoke admin access from ${displayName(row)}?`,
      description: next
        ? "They'll get full access to this admin panel, including user deletion and billing actions."
        : "They'll lose access to the admin panel immediately.",
      confirmText: next ? "Grant admin" : "Revoke admin",
      destructive: !next,
    });
    if (!ok) return;
    setBusyId(row.id);
    try {
      await requestJson(`/api/admin/users/${row.id}/admin-flag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_admin: next }),
      });
      toast.success(next ? "Admin access granted." : "Admin access revoked.");
      refetchRef.current();
    } catch (err) {
      notifyError(err);
    } finally {
      setBusyId(null);
    }
  };

  const columns: Column<AdminUserRow>[] = useMemo(
    () => [
      {
        key: "email",
        header: "Email",
        render: (r) => (
          <Link href={`/admin/users/${r.id}`} className="font-medium text-foreground hover:text-accent-brand hover:underline">
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
        header: "Plan status",
        render: (r) => (
          <span className={r.status === "active" ? "text-success" : "text-muted-foreground"}>
            {r.status}
          </span>
        ),
      },
      {
        key: "lastActiveAt",
        header: "Last active",
        render: (r) => (
          <span
            className="text-muted-foreground"
            title={r.lastActiveAt ? new Date(r.lastActiveAt).toLocaleString() : undefined}
          >
            {fmtLastActive(r.lastActiveAt)}
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
      {
        key: "actions",
        header: "Actions",
        className: "text-right",
        render: (r) => (
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busyId === r.id}
              onClick={() => toggleAdmin(r)}
              title={r.isAdmin ? "Revoke admin" : "Make admin"}
              aria-label={r.isAdmin ? "Revoke admin" : "Make admin"}
            >
              {r.isAdmin ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busyId === r.id}
              onClick={() => toggleBan(r)}
              className={r.isBanned ? "" : "text-destructive hover:text-destructive"}
              title={r.isBanned ? "Unban" : "Ban"}
              aria-label={r.isBanned ? "Unban" : "Ban"}
            >
              {r.isBanned ? <ShieldCheck className="h-3.5 w-3.5" /> : <BanIcon className="h-3.5 w-3.5" />}
            </Button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busyId]
  );

  return (
    <DataTable<AdminUserRow>
      endpoint="/api/admin/users"
      columns={columns}
      rowKey={(r) => r.id}
      searchPlaceholder="Search username, email, or cus_…"
      emptyMessage="No users match."
      onReady={(refetch) => {
        refetchRef.current = refetch;
      }}
    />
  );
}
