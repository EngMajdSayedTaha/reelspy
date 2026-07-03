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
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border-strong bg-background px-6 py-20 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
        <AlertTriangle className="h-6 w-6 text-brand" />
      </span>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">This page hit an error</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Something went wrong loading this section. Try again, or head back to the dashboard.
        </p>
      </div>
      <button
        type="button"
        onClick={() => reset()}
        className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
      >
        <RefreshCw className="h-4 w-4" />
        Try again
      </button>
    </div>
  );
}
