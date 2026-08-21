import type { ReactNode } from "react";
import { headers } from "next/headers";
import { requireAdminPage } from "@/lib/admin/auth";
import { AdminShell } from "@/components/admin/AdminShell";

// The authoritative step-up gate. Every real admin page renders inside this
// layout, so an admin who has not entered their passphrase (or whose elevation
// expired, idled out or was revoked) is redirected to /admin/unlock before a
// single page's code runs. The middleware check is only a belt on top of this.
//
// Non-admins never reach here — the parent layout 404s them — which is why this
// one may safely redirect instead of hiding: it is telling a known admin to
// prove it, not telling a stranger where the door is.
export default async function AdminPanelLayout({ children }: { children: ReactNode }) {
  // Where to return to after unlocking. Set by middleware from the real URL;
  // it only ever feeds a same-app redirect target, and is validated as such
  // below, so a forged header buys nothing.
  const pathname = (await headers()).get("x-pathname");
  const next = pathname && /^\/admin(\/|$)/.test(pathname) ? pathname : undefined;

  const { user, elevation } = await requireAdminPage(next);

  return (
    <AdminShell email={user.email ?? null} expiresAt={elevation.expiresAt}>
      {children}
    </AdminShell>
  );
}
