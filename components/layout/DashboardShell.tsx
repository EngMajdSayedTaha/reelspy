"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import type { SidebarUser } from "@/lib/user/sidebar-user";

export function DashboardShell({
  children,
  user,
}: {
  children: ReactNode;
  user: SidebarUser | null;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  return (
    <ConfirmProvider>
      <div className="min-h-screen bg-background text-foreground">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} />
        <main className="min-h-screen lg:ml-[240px]">
          <TopBar onMenu={() => setSidebarOpen(true)} />
          {/* Keyed by route so every page entrance replays the fade-up. */}
          <section key={pathname} className="animate-rise p-4 sm:p-6 lg:p-8">
            {children}
          </section>
        </main>
      </div>
    </ConfirmProvider>
  );
}
