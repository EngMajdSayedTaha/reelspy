"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Lock, Menu, ShieldAlert } from "lucide-react";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { ReauthProvider } from "@/components/admin/security/ReauthProvider";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { requestJson, notifyError } from "@/lib/utils/api";

// Admin app chrome: fixed sidebar + a slim top bar carrying an amber ADMIN
// badge so it's always visually obvious you're operating on other users' data.
// English-only, no tour/quiz/i18n — deliberately separate from DashboardShell.
//
// It also carries the step-up controls: how long this elevation has left, and
// a one-click lock. Both exist so "I'm stepping away from the laptop" has an
// obvious, immediate answer that doesn't involve signing out of the product.
export function AdminShell({
  email,
  expiresAt,
  children,
}: {
  email: string | null;
  /** Absolute deadline of the current elevation (lib/admin/elevation.ts). */
  expiresAt: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [locking, setLocking] = useState(false);
  // A ticking counter rather than a stored countdown: the label is derived from
  // props on every render, so it stays correct when `expiresAt` changes without
  // an effect writing state back into the component.
  const [, setTick] = useState(0);
  const remaining = timeLeft(expiresAt);

  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  const lock = async () => {
    if (locking) return;
    setLocking(true);
    try {
      await requestJson("/api/admin/security/lock", { method: "POST" });
      router.replace("/admin/unlock");
      router.refresh();
    } catch (err) {
      notifyError(err);
      setLocking(false);
    }
  };

  return (
    <ReauthProvider>
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
              <div className="ms-auto flex items-center gap-3">
                <span
                  className="hidden text-xs text-muted-foreground sm:inline"
                  title="This elevated session ends automatically — sooner if you go idle."
                >
                  Re-locks in {remaining}
                </span>
                <span className="hidden max-w-[180px] truncate text-xs text-muted-foreground md:inline">
                  {email}
                </span>
                <button
                  type="button"
                  onClick={() => void lock()}
                  disabled={locking}
                  title="End this elevated session now"
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-50"
                >
                  <Lock className="h-3.5 w-3.5" />
                  Lock
                </button>
              </div>
            </header>
            <section className="min-w-0 overflow-x-clip p-4 sm:p-6 lg:p-8">{children}</section>
          </main>
        </div>
      </ConfirmProvider>
    </ReauthProvider>
  );
}

function timeLeft(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "moments";
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)}m`;
}
