"use client";

import { useState } from "react";
import { AlertDialog } from "radix-ui";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// A destructive-action modal that requires the operator to TYPE an exact string
// (e.g. the target user's email) before the confirm button enables. Used for
// irreversible admin actions (GDPR delete). onConfirm runs while a spinner shows.
export function TypeToConfirm({
  open,
  onOpenChange,
  title,
  description,
  confirmPhrase,
  confirmLabel = "Delete",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmPhrase: string;
  confirmLabel?: string;
  onConfirm: (typed: string) => Promise<void>;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const matches = typed.trim() === confirmPhrase;

  const close = (next: boolean) => {
    if (busy) return;
    if (!next) setTyped("");
    onOpenChange(next);
  };

  return (
    <AlertDialog.Root open={open} onOpenChange={close}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 shadow-2xl focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95">
          <AlertDialog.Title className="text-lg font-semibold text-foreground">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {description}
          </AlertDialog.Description>

          <div className="mt-4 flex flex-col gap-2">
            <label className="text-xs text-muted-foreground">
              Type <code className="rounded bg-surface-2 px-1 font-mono text-foreground">{confirmPhrase}</code> to confirm
            </label>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="outline" size="lg" disabled={busy} onClick={() => close(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="lg"
              disabled={!matches || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onConfirm(typed.trim());
                  setTyped("");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Working…" : confirmLabel}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
