"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function Error({
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
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0d0d0d] px-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1a1a1a]">
        <AlertTriangle className="h-6 w-6 text-[#F9E400]" />
      </span>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-white">Something went wrong</h1>
        <p className="max-w-sm text-sm text-zinc-400">
          An unexpected error occurred. You can try again, and if it keeps happening, reload the page.
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
