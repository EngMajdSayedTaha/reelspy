"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// Collapsible pretty-printed JSON, for jsonb payloads (audit entries, content
// row snapshots, entitlements). Read-only. Starts collapsed by default so a
// long list of rows stays scannable.
export function JsonViewer({
  data,
  label = "JSON",
  defaultOpen = false,
}: {
  data: unknown;
  label?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  let text: string;
  try {
    text = JSON.stringify(data, null, 2);
  } catch {
    text = String(data);
  }

  return (
    <div className="rounded-lg border border-border bg-surface-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-muted-foreground transition hover:text-foreground"
      >
        <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")} />
        {label}
      </button>
      {open ? (
        <pre className="max-h-96 overflow-auto border-t border-border px-3 py-2 text-xs leading-relaxed text-foreground">
          {text}
        </pre>
      ) : null}
    </div>
  );
}
