"use client";

import { useState, type ReactNode } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";

export function DashboardShell({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <ConfirmProvider>
      <div className="min-h-screen bg-[#0d0d0d] text-zinc-100">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="min-h-screen lg:ml-[240px]">
          <TopBar onMenu={() => setSidebarOpen(true)} />
          <section className="p-4 sm:p-6 lg:p-8">{children}</section>
        </main>
      </div>
    </ConfirmProvider>
  );
}
