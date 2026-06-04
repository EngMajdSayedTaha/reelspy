import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0d0d0d] text-zinc-100">
      <Sidebar />
      <main className="ml-[240px] min-h-screen">
        <TopBar />
        <section className="p-8">{children}</section>
      </main>
    </div>
  );
}
