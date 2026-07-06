import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { getSidebarUser } from "@/lib/user/sidebar-user";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { getDictionary } from "@/lib/i18n/dictionaries";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await getSidebarUser();
  const { locale } = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  const dict = getDictionary(locale);
  return (
    <DashboardShell user={user} dict={dict} locale={locale}>
      {children}
    </DashboardShell>
  );
}
