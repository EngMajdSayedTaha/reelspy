"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Dialog } from "radix-ui";
import { PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReleaseCard } from "@/components/release/ReleaseCard";
import { acknowledgeRelease } from "@/app/dashboard/whats-new/actions";
import type { Release } from "@/lib/release/types";
import { useDict } from "@/lib/i18n/I18nProvider";

// Shown once, after an update the user hasn't caught up on yet. The dashboard
// layout decides whether it renders at all (see lib/release/seen.ts) — this
// component only owns the closing behaviour.
//
// Unlike QuizModal this one IS dismissable by Escape and by clicking away: it's
// news, not a required step, and interrupting someone mid-task with a popup they
// can't wave off is how you teach them to resent the next one. Every route out —
// the button, the backdrop, the link to the full history — marks it seen.
export function WhatsNewDialog({ release }: { release: Release }) {
  const t = useDict().release;
  const [open, setOpen] = useState(true);
  const [, startTransition] = useTransition();

  const close = () => {
    setOpen(false);
    // Not awaited: the dialog should disappear the instant it's dismissed, and
    // the write is advisory — worst case it reappears once more.
    startTransition(() => {
      void acknowledgeRelease();
    });
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium text-accent-brand">
            <PartyPopper className="h-4 w-4" aria-hidden />
            {t.dialog.eyebrow}
          </div>

          {/* The card carries the real heading and description; Radix needs its
              own Title/Description for the accessible name, so they're rendered
              visually hidden rather than duplicated on screen. */}
          <Dialog.Title className="sr-only">{release.title.en}</Dialog.Title>
          <Dialog.Description className="sr-only">{release.summary.en}</Dialog.Description>

          <ReleaseCard release={release} isCurrent bare />

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/dashboard/whats-new"
              onClick={close}
              className="text-sm text-muted-foreground underline-offset-2 hover:underline"
            >
              {t.dialog.seeAll}
            </Link>
            <Button type="button" onClick={close}>
              {t.dialog.dismiss}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
