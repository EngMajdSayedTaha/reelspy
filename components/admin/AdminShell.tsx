"use client";

import { useState, type ReactNode } from "react";
import { Menu, ShieldAlert } from "lucide-react";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";

// Admin app chrome: fixed sidebar + a slim top bar carrying an amber ADMIN
// badge so it's always visually obvious you're operating on other users' data.
// English-only, no tour/quiz/i18n — deliberately separate from DashboardShell.
export function AdminShell({ email, children }: { email: string | null; children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <ConfirmProvider>
      <div className="min-h-screen bg-background text-foreground">
        <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="min-h-screen lg:ms-[240px]">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur sm:px-6">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 rounded-md bg-warning/15 px-2 py-1 text-warning">
              <ShieldAlert className="h-4 w-4" />
              <span className="text-xs font-bold uppercase tracking-wider">Admin Control</span>
            </div>
            <div className="ms-auto truncate text-xs text-muted-foreground">{email}</div>
          </header>
          <section className="min-w-0 overflow-x-clip p-4 sm:p-6 lg:p-8">{children}</section>
        </main>
      </div>
    </ConfirmProvider>
  );
}
