"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

// Scoped to the dashboard, so it renders inside the sidebar/topbar shell.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-[#262626] bg-[#0f0f0f] px-6 py-20 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1a1a1a]">
        <AlertTriangle className="h-6 w-6 text-[#F9E400]" />
      </span>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-white">This page hit an error</h2>
        <p className="max-w-sm text-sm text-zinc-400">
          Something went wrong loading this section. Try again, or head back to the dashboard.
        </p>
      </div>
      <button
        type="button"
        onClick={() => reset()}
        className="flex h-10 items-center gap-2 rounded-lg bg-[#F9E400] px-4 text-sm font-semibold text-black transition hover:bg-[#F9E400]/90"
      >
        <RefreshCw className="h-4 w-4" />
        Try again
      </button>
    </div>
  );
}
