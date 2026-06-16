import type { ReactNode } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { getSidebarUser } from "@/lib/user/sidebar-user";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await getSidebarUser();
  return <DashboardShell user={user}>{children}</DashboardShell>;
}
