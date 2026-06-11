"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";

export function DashboardShell({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  return (
    <ConfirmProvider>
      <div className="min-h-screen bg-[#0d0d0d] text-zinc-100">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
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
