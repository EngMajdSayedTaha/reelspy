import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/billing/admin";

// Identity gate for EVERYTHING under /admin, including the unlock and setup
// screens: no session or no `is_admin` and the whole tree is a 404. Never a
// redirect and never a message — a stranger who guesses the URL must not learn
// that an admin area exists at all.
//
// The second gate — a live elevation from the admin passphrase — lives one
// level down in (panel)/layout.tsx, because the (gate) screens are how you GET
// an elevation and cannot require one. Route groups keep both under /admin
// without either appearing in the URL. See lib/admin/elevation.ts.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();
  const ok = await isAdminUser(supabase, user.id).catch(() => false);
  if (!ok) notFound();

  return <>{children}</>;
}
