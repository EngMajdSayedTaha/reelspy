import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/billing/admin";
import { AdminShell } from "@/components/admin/AdminShell";

// Authoritative admin gate. Every /admin/** page renders inside this layout, so
// a non-admin (or signed-out user) hits notFound() before any admin page code
// runs — the middleware rewrite is only a belt on top of this. Deliberately not
// nested under /dashboard: the admin area has its own English-only shell with
// none of the user dashboard's tour/quiz/i18n machinery.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();
  const ok = await isAdminUser(supabase, user.id).catch(() => false);
  if (!ok) notFound();

  return <AdminShell email={user.email ?? null}>{children}</AdminShell>;
}
